// dataEntryRoutes.js
const express = require('express');
const router = express.Router();

const { Farmer, Antimicrobial, Treatment } = require('./models_data_entry');

/* ---------- Farmer routes ---------- */
router.post('/farmers', async (req, res) => {
  try {
    const doc = new Farmer(req.body);
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message, details: err.errors || null });
  }
});

router.get('/farmers', async (req, res) => {
  try {
    const q = {};
    if (req.query.farm_id) q.farm_id = req.query.farm_id;
    if (req.query.village) q.village = req.query.village;
    const farmers = await Farmer.find(q).lean();
    res.json(farmers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/farmers/:id', async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    res.json(farmer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/farmers/:id', async (req, res) => {
  try {
    const farmer = await Farmer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    res.json(farmer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/farmers/:id', async (req, res) => {
  try {
    await Farmer.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- Animal routes (embedded) ---------- */
router.post('/farmers/:id/animals', async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });

    // optional: enforce unique tagId per farmer
    if (req.body.tagId && farmer.animals.some(a => a.tagId === req.body.tagId)) {
      return res.status(409).json({ error: 'tagId already exists for this farmer' });
    }

    farmer.animals.push(req.body);
    await farmer.save();
    res.status(201).json(farmer.animals[farmer.animals.length - 1]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/farmers/:id/animals', async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id).lean();
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    let animals = farmer.animals || [];
    if (req.query.type) animals = animals.filter(a => a.type === req.query.type);
    if (req.query.status) animals = animals.filter(a => a.status === req.query.status);
    res.json(animals);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/farmers/:id/animals/:animalId', async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    const animal = farmer.animals.id(req.params.animalId);
    if (!animal) return res.status(404).json({ error: 'Animal not found' });
    Object.assign(animal, req.body);
    await farmer.save();
    res.json(animal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/farmers/:id/animals/:animalId', async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    const animal = farmer.animals.id(req.params.animalId);
    if (!animal) return res.status(404).json({ error: 'Animal not found' });
    animal.remove();
    await farmer.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- Treatment routes (data entry + withdrawal calc) ---------- */

/**
 * species -> relevant food products
 * extend this map if you have more species
 */
const productMap = {
  cow: ['milk', 'meat'],
  buffalo: ['milk', 'meat'],
  goat: ['milk', 'meat'],
  sheep: ['milk', 'meat'],
  chicken: ['egg', 'meat'],
  pig: ['meat'],
  default: ['meat']
};

function addDaysToDate(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Create a treatment: calculates relevant withdrawal_end per species and saves Treatment
router.post('/treatments', async (req, res) => {
  try {
    const body = { ...req.body };

    if (!body.farmer_id || !body.drug_id || !body.animal_id) {
      return res.status(400).json({ error: 'farmer_id, animal_id and drug_id are required' });
    }

    // fetch farmer and resolve farm_id
    const farmer = await Farmer.findById(body.farmer_id).lean();
    if (!farmer) return res.status(400).json({ error: 'Farmer not found' });
    if (!body.farm_id) body.farm_id = farmer.farm_id || null;

    // find animal by _id or tagId
    const animal = (farmer.animals || []).find(a => {
      try { return String(a._id) === String(body.animal_id) || a.tagId === body.animal_id; } catch (e) { return false; }
    });
    if (!animal) return res.status(400).json({ error: 'Animal not found for this farmer' });

    const species = (animal.type || '').toLowerCase();
    const relevantProducts = productMap[species] || productMap.default;

    // administered_at - use provided or now
    const administeredAt = body.administered_at ? new Date(body.administered_at) : new Date();
    body.administered_at = administeredAt;

    // lookup antimicrobial metadata
    const drug = await Antimicrobial.findOne({ drug_id: body.drug_id }).lean();
    if (!drug) {
      return res.status(400).json({ error: `Unknown drug_id: ${body.drug_id}` });
    }

    // fill human-readable name (drug_raw) if schema requires
    body.drug_raw = drug.canonical_name || drug.drug_name || body.drug_id;

    // compute withdrawal_end only for relevant products
    const withdrawal_end = { milk: null, meat: null, egg: null, other: null };
    const wd = drug.withdrawal_days || {};
    for (const tissue of relevantProducts) {
      if (wd[tissue] != null && !Number.isNaN(Number(wd[tissue]))) {
        withdrawal_end[tissue] = addDaysToDate(administeredAt, Number(wd[tissue]));
      } else {
        withdrawal_end[tissue] = null;
      }
    }
    body.withdrawal_end = withdrawal_end;

    // optional: record which animal tagId was used (if provided)
    if (!body.animal_tag && animal.tagId) body.animal_tag = animal.tagId;

    const treatment = new Treatment(body);
    await treatment.save();

    res.status(201).json(treatment);
  } catch (err) {
    console.error('Treatment create error:', err);
    res.status(400).json({ error: err.message, details: err.errors || null });
  }
});

// List treatments (filter by farmer_id, animal_id, drug_id)
router.get('/treatments', async (req, res) => {
  try {
    const q = {};
    if (req.query.farmer_id) q.farmer_id = req.query.farmer_id;
    if (req.query.farm_id) q.farm_id = req.query.farm_id;
    if (req.query.animal_id) q.animal_id = req.query.animal_id;
    if (req.query.drug_id) q.drug_id = req.query.drug_id;

    const page = Math.max(0, parseInt(req.query.page || '0', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const list = await Treatment.find(q).sort({ administered_at: -1 }).skip(page * limit).limit(limit).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
