"use strict";
const Ajv = require("ajv");
const ajv = new Ajv({ useDefaults: true });
const debug = require("debug")("abc4:interface");

const { orderSchema, templateCmd } = require("./utils");
const { getMethod } = require("./providers/index");

//TODO describe order and cluster object in README
/**
 * create HPC cluster on cloud
 * @param {Order} order - order object for the cluster to build
 * @returns {Cluster} - cluster object which is just created
 */
async function create(order) {
  //validate order
  if (!ajv.validate(orderSchema, order)) {
    debug(`invalid order ${ajv.errors}`);
    return null;
  }
  const provider = order.provider.toLowerCase();
  const createCluster = getMethod(provider, "create");
  let cluster;
  try {
    cluster = await createCluster(order);
  } catch (e) {
    //should be destroy if part of cluster is created in createCluster()
    //so, just log and exit at this part
    debug("cluster creation failed", e);
    return null;
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
  return templateCmd.bind(null, "destroy", clusterID, id, pw);
}

/**
 * destroy cluster which was created by create()
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {Object} list of instances created by abc4
 */
async function list(clusterID, id, pw) {
  return templateCmd.bind(null, "list", clusterID, id, pw);
}

/**
 * increase child node in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @param {number} n - how many nodes to be add
 * @returns {boolean} true if child node is successfully increased
 */
async function increase(clusterID, id, pw, n = 1) {
  return templateCmd.bind(null, "increase", clusterID, id, pw, n);
}

/**
 * decrease child node in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @param {number} n - how many nodes to be decreased
 * @returns {boolean} true if child node is successfully decreased
 *
 * please note that if n is larger than number of existing child nodes,
 * head node is still working after decrease()
 */
async function decrease(clusterID, id, pw, n = 1) {
  return templateCmd.bind(null, "decrease", clusterID, id, pw, n);
}

/**
 * suspend all nodes in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {boolean} true if all instance is successfully suspended
 */
async function suspend(clusterID, id, pw) {
  return templateCmd.bind(null, "suspend", clusterID, id, pw);
}

/**
 * resume all nodes in the cluster
 * @param {string} clusterID - id string which was returned from create()
 * @param {string} id - id for cloud provider
 * @param {string} pw - pw for cloud provider
 * @returns {boolean} true if all instance is successfully resumed
 */
async function resume(clusterID, id, pw) {
  return templateCmd.bind(null, "resume", clusterID, id, pw);
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
