"use strict";
//ID must be abc4_{provider}_..._uuid. provider is one of provider name in lower case (only aws for now).
//each provider can add some necessary info between provider name and uuid
const reID = /abc4_(aws)_.*_[\da-f]{8}-[\da-f]{4}-1[\da-f]{3}-[\da-f]{4}-[\da-f]{12}/;

const idSchema = {
  type: "string",
  regexp: reID.toString()
};

const provider = {
  type: "string",
  regexp: "/aws/i",
  transform: ["trim", "toLowerCase"]
};
const numNodes = {
  type: "integer",
  minimum: 1,
  default: 1
};
const os = {
  type: "string",
  regexp: "/(centos[67]|ubuntu(16|18))/i",
  default: "centos7",
  transform: ["trim", "toLowerCase"]
};
const rootVolume = {
  type: "number",
  minimum: 0,
  default: 0
};
const shareStorage = {
  type: "boolean",
  default: true
};
const headOnlyParam = {
  type: "object",
  default: {}
};
const publicKey = {
  type: "string"
};
const id = {
  type: "string"
};
const pw = {
  type: "string"
};
const batch = {
  type: "string",
  regexp: "/(pbspro|slurm)/i",
  transform: ["trim", "toLowerCase"]
};
const mpi = {
  type: "string",
  regexp: "/(openmpi|mpich)/i",
  transform: ["trim", "toLowerCase"]
};
const compiler = {
  type: "string",
  regexp: "/(gcc|clang)/i",
  transform: ["trim", "toLowerCase"]
};

const orderSchema = {
  type: "object",
  required: ["provider"],
  properties: {
    provider,
    numNodes,
    os,
    rootVolume,
    shareStorage,
    headOnlyParam,
    publicKey,
    id,
    pw,
    batch,
    mpi,
    compiler
  }
};

module.exports = {
  reID,
  idSchema,
  orderSchema
};
