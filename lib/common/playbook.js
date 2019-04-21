"use strict";
const staticPlaybooks = {};
staticPlaybooks.nfs = `\
- hosts: head
  become: yes
  vars:
    nfs_exports: ["/home {{ ansible_default_ipv4['network'] }}/{{ ansible_default_ipv4['netmask'] }}(rw,no_root_squash,fsid=0,no_subtree_check)"]
  roles:
    - { "role": "geerlingguy.nfs" }
- hosts: child
  become: yes
  tasks:
    - shell: "hostname -i"
      register: nfs_server
      delegate_to: localhost
    - include_role:
        name: andrewrothstein.nfs-client
    - mount:
        path: "/home"
        state: "mounted"
        fstype: "nfs"
        src: "{{ nfs_server.stdout }}:/"
        opts: "proto=tcp,rw,soft"
`;

function getHostbasedAuthPlaybook() {
  return `\
- hosts: localhost
  become: yes
  roles:
  - so5.ssh_hostbased_auth
`;
}

function getPbsproPlaybook(opt) {
  const head = `\
- hosts: all
  become: yes
  `;
  let vars = `\
  vars:
    pbspro_prefix: "/usr/local"
    pbspro_child_nodes: "{{ groups['child'] }}"
  `;
  //be careful about indent!!
  //this function produce YAML strings and pbspro_child_nodes and pbspro_qmgr_cmds are
  //in the same level
  if (opt.qmgrCmds) {
    vars += `\
  pbspro_qmgr_cmds: ${opt.qmgrCmds}
    `;
  }
  if (opt.useServer) {
    vars += `\
  pbspro_run_job_on_server: ${opt.useServer}
  `;
  }

  const tail = `\
  pre_tasks:
    - shell: "hostname"
      register: pbs_server
      delegate_to: localhost
      run_once: True
    - set_fact:
        pbspro_server_hostname: "{{ pbs_server.stdout }}"
  roles:
    - { "role": "so5.pbspro", "pbspro_server": "{{ 'head' in group_names }}" }
  `;

  return `\
${head}
${vars}
${tail}
`;
}

/**
 * Return playbook.
 * @param {string} name - Name of playbook.
 * @returns {string} - Contens of playbook.
 */
function getPlaybook(name, opt) {
  if (name === "pbspro") {
    return getPbsproPlaybook(opt);
  }
  return staticPlaybooks[name]; //this statement is fall back, so if name is invaid, this function returns undefined
}

function getPlaybookNames(opt) {
  const playbooks = [];
  if (opt.shareStorage) {
    playbooks.push("nfs");
  }
  if (opt.batch === "pbspro") {
    playbooks.push(opt.batch);
  }
  return playbooks;
}

function getRoleNames(opt) {
  const shareStorage = opt.shareStorage;
  const batch = opt.batch;

  const roleNames = [];
  if (shareStorage) {
    roleNames.push("geerlingguy.nfs", "andrewrothstein.nfs-client");
  }
  if (batch === "pbspro") {
    roleNames.push("so5.pbspro");
  }
  return roleNames;
}

module.exports = {
  getPlaybook,
  getPlaybookNames,
  getRoleNames,
  getHostbasedAuthPlaybook
};
