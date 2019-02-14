"use strict";

/**
 * @typedef order
 * @type {object}
 * @property {string} provider      - cloud provider
 * @property {number} numNodes      - number of nodes
 * @property {string} os            - operating system
 * @property {number} rootVolume    - root storage volume in GB
 * @property {boolean} shareStorage - if true, head node's storage is shared via NFSv4
 * @property {object} headOnlyParam - additional parameters only for head node
 * @property {string} publicKey     - public key which will be stored in head node
 * @property {string} id            - id for cloud provider (e.g. access key for AWS)
 * @property {string} pw            - pw for cloud provider (e.g. secret access key for AWS)
 * @property {string} batch         - batch system
 * @property {string} mpi           - MPI library
 * @property {string} compiler      - compiler
 * @property {function} debug       - debug output function
 */

/**
 * @typedef cluster
 * @type {object}
 * @property {string} user - username at head node
 * @property {string} id - unique string for cluster
 * @property {string} privateKey - private key to login to head node. if publicKey is specified in order object, this property is undefined.
 * @property {object[]} headNodes - ip, hostname of head node in public and private network.
 * @property {object[]} childNodes - ip, hostname of child nodes in private network.
 */

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
 * @param {Object} opt - option object
 * @param {Object} opt.clusterID - id string for cluster which is included in Cluster object
 * @param {Object} opt.id        - same as order.id
 * @param {Object} opt.pw        - same as order.pw
 * @param {Object} opt.n         - num nodes to be increased or decreased (if method is not increase or decrease, this property is ignored)
 * @param {Object} opt.debug     - same as order.debug
 * @returns {Promise} - just fullfilled with undefined or some Error
 */
async function templateCmd(method, opt) {
  if (typeof opt.debug === "function") {
    debug.log = opt.debug;
  }
  const clusterID = opt.clusterID;
  if (!ajv.validate(idSchema, clusterID)) {
    const err = new Error("Invalid ID specified");
    err.clusterID = clusterID;
    debug("invalid id", clusterID);
    throw err;
  }
  const provider = getProviderFromID(clusterID);
  const cmd = getMethod(provider, method);
  return cmd(clusterID, opt);
}

/**
 * create HPC cluster on cloud
 * @param {Order} order - order object for the cluster to build
 * @returns {Cluster} - cluster object which is just created
 */
async function create(order) {
  if (typeof order.debug === "function") {
    debug.log = order.debug;
  }
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
  debug(`cluster creation done on ${provider}: ${cluster.clusterID}`);
  return cluster;
}


/**
 * destroy cluster which was created by create()
 * @param {Object} opt
 * @returns {boolean} true if all instance is successfully destried
 */
async function destroy(opt) {
  return templateCmd.bind(null, "destroy", opt)();
}

/**
 * destroy cluster which was created by create()
 * @param {Object} opt
 * @returns {Object} list of instances created by abc4
 */
async function list(opt) {
  return templateCmd.bind(null, "list", opt)();
}

/**
 * increase child node in the cluster
 * @param {Object} opt
 * @returns {boolean} true if child node is successfully increased
 */
async function increase(opt) {
  return templateCmd.bind(null, "increase", opt)();
}

/**
 * decrease child node in the cluster
 * @param {Object} opt
 * @returns {boolean} true if child node is successfully decreased
 */
async function decrease(opt) {
  return templateCmd.bind(null, "decrease", opt)();
}

/**
 * suspend all nodes in the cluster
 * @param {Object} opt
 * @returns {boolean} true if all instance is successfully suspended
 */
async function suspend(opt) {
  return templateCmd.bind(null, "suspend", opt)();
}

/**
 * resume all nodes in the cluster
 * @param {Object} opt
 * @returns {boolean} true if all instance is successfully resumed
 */
async function resume(opt) {
  return templateCmd.bind(null, "resume", opt)();
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
