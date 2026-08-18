import mongoose, { Schema } from "mongoose";

export type CounterDocument = mongoose.Document & {
  _id: string;
  seq: number;
};

const counterSchema = new Schema<CounterDocument>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = mongoose.model<CounterDocument>("Counter", counterSchema);
