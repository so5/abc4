"use strict";


/**
 * convert string to array of string which has only one element
 * @param {string} target
 * @return  {*} if target is string this function return string[], any other case it return target itself
 */
function string2array(target) {
  if (typeof target !== "string") {
    return target;
  }
  return [target];
}

module.exports = {
  string2array
};
