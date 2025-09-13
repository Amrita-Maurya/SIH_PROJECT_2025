// complianceRoutes.js
const express = require('express');
const router = express.Router();

// Use central models entry (re-export file) so we get Farmer + compliance models
const {  MrlLimit, MrlCheck, Notification } = require('./models_compliance');
const { Farmer} = require('./models_data_entry');


/**
 * Resolve farm_id from a farmer document. Returns null if not resolvable.
 */
async function resolveFarmIdFromFarmer(farmerId) {
  if (!farmerId) return null;
  try {
    const f = await Farmer.findById(farmerId).lean();
    return f ? (f.farm_id || null) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Helper: attempt to determine compliance.
 * Priority:
 *  - If request provides `compliant` (true/false) -> use it.
 *  - Else if `mrl_mg_per_kg` is provided and `measured_mg_per_kg` is provided -> compare.
 *  - Else try to find an MrlLimit by drug+tissue and compare (if found).
 *  - If unable to decide -> return null (unknown).
 */
async function determineCompliance(body) {
  // normalize strings
  if (body.drug && typeof body.drug === 'string') body.drug = body.drug.toLowerCase();
  if (body.tissue && typeof body.tissue === 'string') body.tissue = body.tissue.toLowerCase();

  // explicit provided compliant
  if (typeof body.compliant === 'boolean') return body.compliant;

  // need measured value to judge
  if (typeof body.measured_mg_per_kg !== 'number' && typeof body.measured_mg_per_kg !== 'string') {
    return null;
  }

  const measured = Number(body.measured_mg_per_kg);
  if (Number.isNaN(measured)) return null;

  // use provided mrl if present
  if (body.mrl_mg_per_kg != null) {
    const mrl = Number(body.mrl_mg_per_kg);
    if (!Number.isNaN(mrl)) return measured <= mrl;
  }

  // lookup MrlLimit
  try {
    const limit = await MrlLimit.findOne({ drug: body.drug, tissue: body.tissue }).lean();
    if (limit && limit.mrl_mg_per_kg != null) {
      return measured <= Number(limit.mrl_mg_per_kg);
    }
  } catch (err) {
    // lookup failed -> unknown
    return null;
  }

  // no data to decide
  return null;
}

// ---------- MRL Checks ----------
router.post('/mrlchecks', async (req, res) => {
  try {
    const body = { ...req.body };

    // normalize small fields
    if (body.drug && typeof body.drug === 'string') body.drug = body.drug.toLowerCase();
    if (body.tissue && typeof body.tissue === 'string') body.tissue = body.tissue.toLowerCase();

    // resolve farm_id from farmer if needed
    if (body.farmer_id && !body.farm_id) {
      body.farm_id = await resolveFarmIdFromFarmer(body.farmer_id);
    }

    // Attempt to compute compliance if not provided
    const computed = await determineCompliance(body);
    if (computed === true || computed === false) {
      body.compliant = computed;
    } else {
      // keep whatever came in (could be undefined/null) but explicitly set to null if unknown
      if (typeof body.compliant !== 'boolean') body.compliant = null;
    }

    // Create and save the MrlCheck
    const check = new MrlCheck(body);
    await check.save();

    // If the check is explicitly non-compliant, create notification
    if (check.compliant === false) {
      try {
        const notif = new Notification({
          farmer_id: check.farmer_id,
          farm_id: check.farm_id || null,
          channel: 'sms', // default channel; change if you have farmer preference
          type: 'MRL_ALERT',
          payload: {
            msg: `Non-compliant residue detected: ${check.drug} in ${check.tissue} (measured: ${check.measured_mg_per_kg}, limit: ${check.mrl_mg_per_kg || 'N/A'})`,
            mrlCheckId: check._id
          },
          status: 'pending'
        });
        await notif.save();
      } catch (nerr) {
        // Log, but do not fail the main request
        console.error('Failed to create notification for non-compliant MRL check:', nerr);
      }
    }

    // return created check
    res.status(201).json(check);
  } catch (err) {
    console.error('MrlCheck create error:', err);
    // expose message
    res.status(400).json({ error: err.message, details: err.errors || null });
  }
});

router.get('/mrlchecks', async (req, res) => {
  try {
    const q = {};
    if (req.query.farm_id) q.farm_id = req.query.farm_id;
    if (req.query.farmer_id) q.farmer_id = req.query.farmer_id;
    if (req.query.drug) q.drug = req.query.drug.toLowerCase();

    const page = Math.max(0, parseInt(req.query.page || '0', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const list = await MrlCheck.find(q).sort({ checked_at: -1 }).skip(page * limit).limit(limit).lean();
    res.json(list);
  } catch (err) {
    console.error('MrlCheck list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Notifications ----------
router.post('/notifications', async (req, res) => {
  try {
    const body = { ...req.body };

    // resolve farm_id from farmer if needed
    if (body.farmer_id && !body.farm_id) {
      body.farm_id = await resolveFarmIdFromFarmer(body.farmer_id);
    }

    const notif = new Notification(body);
    await notif.save();
    res.status(201).json(notif);
  } catch (err) {
    console.error('Notification create error:', err);
    res.status(400).json({ error: err.message, details: err.errors || null });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const q = {};
    if (req.query.farm_id) q.farm_id = req.query.farm_id;
    if (req.query.farmer_id) q.farmer_id = req.query.farmer_id;
    if (req.query.status) q.status = req.query.status;

    const page = Math.max(0, parseInt(req.query.page || '0', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const list = await Notification.find(q).sort({ created_at: -1 }).skip(page * limit).limit(limit).lean();
    res.json(list);
  } catch (err) {
    console.error('Notification list error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
