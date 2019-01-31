"use strict";
const staticPlaybooks = {};
staticPlaybooks.test = `\
- hosts: all
  tasks:
    - debug: "hoge"
    - file:
        path: "/tmp/hoge"
        owner: "centos"
        group: "centos"
        mode: 0644
`;

/**
 * return playbook
 * @param {string} name - name of playbook
 * @returns {string} - contens of playbook
 */
async function getPlaybook(name) {
  return staticPlaybooks[name]; //this statement is fall back, so if name is invaid, this function returns undefined
}

module.exports = {
  getPlaybook
};
