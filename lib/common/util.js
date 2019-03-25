"use strict";

function maskSensitiveValues(key, value) {
  if (["id", "pw", "publickKey", "privateKey"].includes(key)) {
    return "XXXX";
  }
  return value;
}

module.exports = {
  maskSensitiveValues
};
