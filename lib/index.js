"use strict";


/**
 * create HPC cluster on cloud
 * @param {order} order - order object for the cluster to build
 * @returns {string} id
 */
async function create(order) {
}

/**
 * destroy cluster which was created by create()
 * @param {string} id - id string which was returned from create()
 * @returns {boolean} - true if all instance is successfully destried
 */
async function destroy(id) {
}

/**
 * increase child node in the cluster
 * @param {string} id - id string which was returned from create()
 * @param {number} n - how many nodes to be add
 * @returns {boolean} - true if child node is successfully increased
 */
async function increase(id, n = 1) {
}

/**
 * decrease child node in the cluster
 * @param {string} id - id string which was returned from create()
 * @param {number} n - how many nodes to be decreased
 * @returns {boolean} - true if child node is successfully decreased
 *
 * please note that if n is larger than number of existing child nodes,
 * head node is still working after decrease()
 */
async function decrease(id, n = 1) {
}

/**
 * suspend all nodes in the cluster
 * @param {string} id - id string which was returned from create()
 * @returns {boolean} - true if all instance is successfully suspended
 */
async function suspend(id) {
}

/**
 * resume all nodes in the cluster
 * @param {string} id - id string which was returned from create()
 * @returns {boolean} - true if all instance is successfully resumed
 */
async function resume(id) {
}

module.exports = {
  create,
  destroy,
  increase,
  decrease,
  suspend,
  resume
};
