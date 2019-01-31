"use strict";
const Ajv = require("ajv");
const ajv = new Ajv({ useDefaults: true, $data: true });
require("ajv-keywords")(ajv);
const debug = require("debug")("abc4:interface");
const { getMethod } = require("./providers/index");

const { idSchema, orderSchema } = require("./validation/index");

/**
 * parse id string and return provider
 * @param {string } id - id string to be parsed
 * @returns {string } - provider name
 */
function getProviderFromID(id) {
  return /abc4_([a-z]*)_/.exec(id)[1];
}


/**
 * perform minimum argument validation and delegate to actual method
 * @param {string} method - name of method
 * @param {string} clusterID - id string which formaly returned by create()
 * @returns {Promise} - just fullfilled with undefined or some Error
 */
async function templateCmd(method, clusterID, ...args) {
  if (!ajv.validate(idSchema, clusterID)) {
    const err = new Error("Invalid ID specified");
    err.clusterID = clusterID;
    debug("invalid id", clusterID);
    throw err;
  }
  const provider = getProviderFromID(clusterID);
  const cmd = getMethod(provider, method);
  return cmd(clusterID, args);
}

/**
 * create HPC cluster on cloud
 * @param {Order} order - order object for the cluster to build
 * @returns {Cluster} - cluster object which is just created
 */
async function create(order) {
  //validate order
  if (!ajv.validate(orderSchema, order)) {
    const err = new Error("order parse failed");
    err.ajv_errors = ajv.errors;
    debug("invalid order", ajv.errors);
    throw err;
  }
  const provider = order.provider.toLowerCase();
  const createCluster = getMethod(provider, "create");
  let cluster;
  try {
    cluster = await createCluster(order);
  } catch (e) {
    //clean up process must be perfoemed in each createCluster()
    //so, just log and re-throw Error here
    debug("cluster creation failed", e);
    throw e;
  }
  debug(`cluster creation done on ${provider}: ${cluster.id}`);
  return cluster;
}


/**
 * destroy cluster which was created by create()
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {boolean} true if all instance is successfully destried
 */
async function destroy(clusterID, id, pw) {
  return templateCmd.bind(null, "destroy", clusterID, id, pw)();
}

/**
 * destroy cluster which was created by create()
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {Object} list of instances created by abc4
 */
async function list(clusterID, id, pw) {
  return templateCmd.bind(null, "list", clusterID, id, pw)();
}

/**
 * increase child node in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {number} n - how many nodes to be add
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {boolean} true if child node is successfully increased
 */
async function increase(clusterID, n = 1, id, pw) {
  return templateCmd.bind(null, "increase", clusterID, id, pw, n)();
}

/**
 * decrease child node in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {number} n - how many nodes to be decreased
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {boolean} true if child node is successfully decreased
 *
 * please note that if n is larger than number of existing child nodes,
 * head node is still working after decrease()
 */
async function decrease(clusterID, n = 1, id, pw) {
  return templateCmd.bind(null, "decrease", clusterID, id, pw, n)();
}

/**
 * suspend all nodes in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {boolean} true if all instance is successfully suspended
 */
async function suspend(clusterID, id, pw) {
  return templateCmd.bind(null, "suspend", clusterID, id, pw)();
}

/**
 * resume all nodes in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {boolean} true if all instance is successfully resumed
 */
async function resume(clusterID, id, pw) {
  return templateCmd.bind(null, "resume", clusterID, id, pw)();
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
