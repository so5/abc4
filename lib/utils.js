"use strict";
const debug = require("debug")("abc4:interface");
const { getMethod } = require("./providers/index");

//ID must be abc4_{provider}_..._uuid. provider is one of provider name in lower case (only aws for now).
//each provider can add some necessary info between provider name and uuid
const reID = /abc4_(test|aws)_.*_[\da-f]{8}-[\da-f]{4}-1[\da-f]{3}-[\da-f]{4}-[\da-f]{12}/;

/**
 * minimum argument validation and delegate to actual method
 * @param {string} method - name of method
 */
async function templateCmd(method, clusterID, ...args) {
  if (typeof clusterID !== "string" || !reID.test(clusterID)) {
    debug(`invalid id ${clusterID}`);
    return null;
  }
  const provider = getProviderFromID(clusterID);
  const cmd = getMethod(provider, method);
  return cmd(clusterID, args);
}

const orderSchema = {
  type: "object",
  properties: {
    provider: {
      type: "string",
      regexp: /(test|aws)/i
    },
    numNodes: {
      type: "integer",
      minimum: 1,
      default: 1
    },
    os: {
      type: "string",
      regexp: /(centos[67]|ubuntu(16|18))/i,
      default: "centos7"
    },
    nfsVolume: {
      type: "number",
      minimum: 0,
      default: 0
    },
    headOnlyParam: {
      type: "object",
      default: {}
    },
    publicKey: {
      type: "string"
    },
    id: {
      type: "string"
    },
    pw: {
      type: "string"
    }
  },
  required: ["provider"]
};

/**
 * parse id string and return provider
 * @param {string } id - id string to be parsed
 * @returns {string } - provider name
 */
function getProviderFromID(id) {
  return /abc4_([a-z]*)_/.exec(id)[1];
}


module.exports = {
  orderSchema,
  templateCmd
};
