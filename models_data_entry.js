// models_data_entry.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* ---------- Animal (embedded in Farmer) ---------- */
const AnimalSchema = new Schema({
  tagId: { type: String, required: true, index: true },
  type: { type: String, required: true, lowercase: true }, // e.g., cow, buffalo, chicken
  breed: { type: String, lowercase: true },
  gender: { type: String, enum: ['male','female','unknown'], default: 'unknown' },
  dob: { type: Date },
  purchaseDate: { type: Date },
  weightKg: { type: Number },
  status: { type: String, enum: ['active','sold','dead','transferred'], default: 'active' },

  vaccinations: [
    {
      name: { type: String },
      date: { type: Date },
      batch: { type: String },
      notes: { type: String }
    }
  ],

  treatments: [
    {
      drug: { type: String },
      dose: { type: String },
      startDate: { type: Date },
      endDate: { type: Date },
      notes: { type: String }
    }
  ],

  production: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, enum: ['milk','meat','egg','other'], required: true },
      quantity: { type: Number },
      unit: { type: String, default: null },
      notes: { type: String }
    }
  ],

  notes: { type: String }
}, { timestamps: true });

/* ---------- Farmer ---------- */
const FarmerSchema = new Schema({
  name: { type: String, required: true, index: true },
  phone: { type: String, index: true, default: null },
  email: { type: String, index: true, default: null },
  farm_id: { type: String, default: null, index: true },

  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined } // [lng, lat]
  },

  animals: { type: [AnimalSchema], default: [] },
  notes: { type: String, default: null }
}, { timestamps: true });

FarmerSchema.index({ location: '2dsphere' });
FarmerSchema.index({ 'animals.tagId': 1 });

const Farmer = mongoose.models.Farmer || mongoose.model('Farmer', FarmerSchema);

/* ---------- Antimicrobial (canonical drugs) ---------- */
const AntimicrobialSchema = new Schema({
  drug_id: { type: String, required: true, lowercase: true, unique: true },
  canonical_name: { type: String, required: true },
  synonyms: { type: [String], default: [] },
  atcvet: { type: String, default: null },
  withdrawal_days: {
    milk: { type: Number, default: null },
    meat: { type: Number, default: null },
    egg: { type: Number, default: null },
    other: { type: Number, default: null }
  }
}, { timestamps: true });

const Antimicrobial = mongoose.models.Antimicrobial || mongoose.model('Antimicrobial', AntimicrobialSchema);

/* ---------- Treatment (AMU event) ---------- */
const TreatmentSchema = new Schema({
  farmer_id: { type: Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
  farm_id: { type: String, default: null, index: true },

  animal_id: { type: String, default: null },      // tagId or subdoc _id
  animal_ids: { type: [String], default: [] },     // optional list for group treatments

  administered_at: { type: Date, required: true, default: Date.now },
  drug_raw: { type: String, required: true },      // human readable name
  drug_id: { type: String, default: null, index: true }, // canonical drug_id if resolved

  dose_per_animal: { type: Number, default: null },
  dose_unit: { type: String, default: null },
  weightKg: { type: Number, default: null },
  mg_per_kg: { type: Number, default: null },

  route: { type: String, default: null },
  frequency: { type: String, default: null },
  duration_days: { type: Number, default: 1 },
  total_amount: { type: Number, default: null },

  indication: { type: String, default: null },
  prescribed_by: { type: String, default: null },

  withdrawal_end: {
    milk: { type: Date, default: null },
    meat: { type: Date, default: null },
    egg: { type: Date, default: null },
    other: { type: Date, default: null }
  },

  notes: { type: String, default: null }

}, { timestamps: true });

TreatmentSchema.index({ farmer_id: 1, administered_at: -1 });
const Treatment = mongoose.models.Treatment || mongoose.model('Treatment', TreatmentSchema);

/* ---------- Exports (data entry) ---------- */
module.exports = {
  Farmer,
  Antimicrobial,
  Treatment
};
