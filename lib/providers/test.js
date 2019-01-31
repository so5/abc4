const uuidv1 = require("uuid/v1");
//TODO to be moved to test/libinterface.js

async function create(order) {
  return { id: `abc4_test_foo_bar_${uuidv1()}` };
}
async function destroy(clusterID, id, pw) {
}
async function list(clusterID, id, pw) {
}
async function increase(clusterID, n, id, pw) {
}
async function decrease(clusterID, n, id, pw) {
}
async function suspend(clusterID, id, pw) {
}
async function resume(clusterID, id, pw) {
}
