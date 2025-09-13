// models_compliance.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* ---------- MrlLimit ---------- */
const MrlLimitSchema = new Schema({
  drug: { type: String, required: true, lowercase: true, index: true },
  tissue: { type: String, required: true, lowercase: true, index: true }, // milk|meat|egg
  mrl_mg_per_kg: { type: Number, required: true },
  source: { type: String, default: null },
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

const MrlLimit = mongoose.models.MrlLimit || mongoose.model('MrlLimit', MrlLimitSchema);

/* ---------- MrlCheck ---------- */
const MrlCheckSchema = new Schema({
  lab_report_id: { type: String, default: null },
  animal_id: { type: String, default: null },
  farmer_id: { type: Schema.Types.ObjectId, ref: 'Farmer', default: null, index: true },
  farm_id: { type: String, default: null, index: true },

  drug: { type: String, required: true, lowercase: true },
  tissue: { type: String, required: true, lowercase: true }, // milk | meat | egg
  measured_mg_per_kg: { type: Number, default: null },
  mrl_mg_per_kg: { type: Number, default: null },
  compliant: { type: Boolean, default: null },
  checked_at: { type: Date, default: Date.now },
  notes: { type: String, default: null }
}, { timestamps: true });

MrlCheckSchema.index({ farmer_id: 1, checked_at: -1 });
const MrlCheck = mongoose.models.MrlCheck || mongoose.model('MrlCheck', MrlCheckSchema);

/* ---------- Notification ---------- */
const NotificationSchema = new Schema({
  user_id: { type: String, default: null },
  farmer_id: { type: Schema.Types.ObjectId, ref: 'Farmer', default: null, index: true },
  farm_id: { type: String, default: null, index: true },

  channel: { type: String, enum: ['sms','email','inapp'], default: 'sms' },
  type: { type: String, default: null },
  payload: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending','sending','sent','failed','read'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  last_error: { type: String, default: null },
  provider_msg_id: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  sent_at: { type: Date, default: null }
}, { timestamps: true });

NotificationSchema.index({ status: 1 });
NotificationSchema.index({ user_id: 1, farmer_id: 1, created_at: -1 });
const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

/* ---------- Exports (compliance) ---------- */
module.exports = {
  MrlLimit,
  MrlCheck,
  Notification
};
