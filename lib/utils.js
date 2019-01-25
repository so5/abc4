"use strict";
//ID must be abc4-{provider}-uuid. provider is one of provider name in lower case (only aws for now).
const reID = /abc4-(test|aws)-[\da-f]{8}-[\da-f]{4}-1[\da-f]{3}-[\da-f]{4}-[\da-f]{12}/;

const orderSchema = {
  type: "object",
  properties: {
    provider: {
      type: "string",
      regexp: /(test|aws)/i
    },
    n: {
      type: "integer",
      minimum: 1
    },
    os: {
      type: "string",
      regexp: /(centos[67]|ubuntu(16|18))/i
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
  return /-([a-z]*)-/.exec(id)[1];
}


module.exports = {
  reID,
  orderSchema,
  getProviderFromID
};
