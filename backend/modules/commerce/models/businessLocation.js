const mongoose = require('mongoose');

const hoursSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      required: true,
    },
    ranges: [
      {
        open: String, // HH:mm
        close: String,
      },
    ],
  },
  { _id: false }
);

const businessLocationSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['open', 'closed', 'on_call', 'twenty_four'],
      default: 'open',
    },
    visibility: {
      type: String,
      enum: ['public', 'tenant_only', 'private'],
      default: 'public',
    },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    province: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    notes: { type: String, default: '' },
    hours: { type: [hoursSchema], default: [] },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: { type: String, default: 'system' },
  },
  { timestamps: true }
);

businessLocationSchema.pre('validate', function syncCoordinates(next) {
  if (this.isModified('lat') || this.isModified('lng') || !this.location) {
    this.location = {
      type: 'Point',
      coordinates: [this.lng, this.lat],
    };
  }
  next();
});

businessLocationSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('BusinessLocation', businessLocationSchema);

