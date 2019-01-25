"use strict";
const Ajv = require("ajv");
const ajv = new Ajv();
const debug = require("debug")("abc4:interface");
const uuidv1 = require("uuid/v1");

const { orderSchema, reID, getProviderFromID } = require("./utils");
const { getMethod } = require("./internal/index");

/**
 * create HPC cluster on cloud
 * @param {order} order - order object for the cluster to build
 * @returns {string} id
 */
async function create(order) {
  //validate order
  if (!ajv.validate(orderSchema, order)) {
    debug(`invalid order ${ajv.errors}`);
    return null;
  }
  const provider = order.provider.toLowerCase();
  const createCluster = getMethod(provider, "create");
  try {
    await createCluster(order);
  } catch (e) {
    //should be destroy if part of cluster is created in createCluster()
    //so, just log and exit at this part
    debug("cluster creation failed", e);
    return null;
  }
  const id = `abc4-${provider}-${uuidv1()}`;
  debug(`cluster creation done on ${provider}: ${id}`);
  return id;
}

/**
 * destroy cluster which was created by create()
 * @param {string} id - id string which was returned from create()
 * @returns {boolean} true if all instance is successfully destried
 */
async function destroy(id) {
  if (typeof id !== "string" || !reID.test(id)) {
    debug(`invalid id ${id}`);
    return null;
  }
  const provider = getProviderFromID(id);
  const destroyCluster = getMethod(provider, "destroy");
  return destroyCluster(id);
}

/**
 * destroy cluster which was created by create()
 * @param {string| null} id - id string which was returned from create() if id is null, report all instances
 * @returns {Object} list of instances created by abc4
 */
async function list(id = null) {
}

/**
 * increase child node in the cluster
 * @param {string} id - id string which was returned from create()
 * @param {number} n - how many nodes to be add
 * @returns {boolean} true if child node is successfully increased
 */
async function increase(id, n = 1) {
}

/**
 * decrease child node in the cluster
 * @param {string} id - id string which was returned from create()
 * @param {number} n - how many nodes to be decreased
 * @returns {boolean} true if child node is successfully decreased
 *
 * please note that if n is larger than number of existing child nodes,
 * head node is still working after decrease()
 */
async function decrease(id, n = 1) {
}

/**
 * suspend all nodes in the cluster
 * @param {string} id - id string which was returned from create()
 * @returns {boolean} true if all instance is successfully suspended
 */
async function suspend(id) {
}

/**
 * resume all nodes in the cluster
 * @param {string} id - id string which was returned from create()
 * @returns {boolean} true if all instance is successfully resumed
 */
async function resume(id) {
}

module.exports = {
  create,
  destroy,
  list,
  increase,
  decrease,
  suspend,
  resume
};
