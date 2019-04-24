"use strict";

const ansibleConfig = `\
[defaults]
host_key_checking = False
gathering = smart
fact_caching = jsonfile
fact_caching_connection = /etc/ansible/facts
fact_caching_timeout = 3600
callback_whitelist = profile_tasks
timeout = 120
[ssh_connection]
control_path_dir = /tmp/
ssh_args = -oControlMaster=auto -oControlPersist=60m -oPreferredAuthentications=hostbased
`;

const staticPlaybooks = {};
staticPlaybooks.wait_for_bootup = `\
- hosts: all
  gather_facts: no
  tasks:
  - name: wait for all nodes to become reachable via ssh
    wait_for_connection:
      timeout: 600
`;
staticPlaybooks.setupHostbasedAuth = `\
- hosts: localhost
  become: yes
  vars:
    ssh_hostbased_auth_permit_root_login: yes
  roles:
  - so5.ssh_hostbased_auth
`;
staticPlaybooks.nfsServer = `\
- hosts: localhost
  become: yes
  vars:
    nfs_exports: ["/home {{ ansible_default_ipv4['network'] }}/{{ ansible_default_ipv4['netmask'] }}(rw,no_root_squash,fsid=0,no_subtree_check)"]
  roles:
    - { "role": "geerlingguy.nfs" }
`
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
    - include_role:
        name: andrewrothstein.nfs-client
    - shell: "hostname -i"
      register: nfs_server
      delegate_to: localhost
    - mount:
        path: "/home"
        state: "mounted"
        fstype: "nfs"
        src: "{{ nfs_server.stdout }}:/"
        opts: "proto=tcp,rw,soft"
`;
staticPlaybooks.installPBSPro = `\
- hosts: localhost
  become: yes
  vars:
    pbspro_prefix: "/usr/local"
    pbspro_installtaion: true
    pbspro_setup: false
  roles:
    - "so5.pbspro"
`;

function getPbsproPlaybook(opt) {
  const head = `\
- hosts: all
  become: yes
  `;
  let vars = `\
  vars:
    pbspro_prefix: "/usr/local"
    pbspro_installtaion: false
    pbspro_setup: true
    pbspro_server_hostname: "{{ groups['head'][0] }}"
    pbspro_child_nodes: "{{ groups['child'] }}"\n`;
  //be careful about indent!!
  //pbspro_child_nodes and pbspro_qmgr_cmds must be in the same indent level
  if (opt.qmgrCmds) {
    vars += `    pbspro_qmgr_cmds: [ ${opt.qmgrCmds.map((e)=>{return `"${e}"`}).join(",")} ]\n`;
  }
  if (opt.runJobOnBatchServer) {
    vars += `    pbspro_run_job_on_server: ${opt.runJobOnBatchServer}\n`;
  }

  const tail = `\
  roles:
    - { "role": "so5.pbspro", "pbspro_server":  "{{ 'head' in group_names }}" }\n`;

  return `\
${head}
${vars}
${tail}
`;
}

function getNFSPlaybook(opt){
  if(opt.isChild){
    return `\
- hosts: localhost
  become: yes
  tasks:
    - include_role:
        name: andrewrothstein.nfs-client
    - mount:
        path: "/home"
        state: "mounted"
        fstype: "nfs"
        src: "{{ groups['head'][0] }}:/"
        opts: "proto=tcp,rw,soft"
`
  }
  return staticPlaybooks["nfsServer"]
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
  if (name === "userPlaybook") {
    return opt.playbook;
  }
  return staticPlaybooks[name]; //this statement is fall back, so if name is invaid, this function returns undefined
}

function getPlaybookNames(opt) {
  const playbooks = ["wait_for_bootup"];
  if (opt.shareStorage) {
    playbooks.push("nfs");
  }
  if (opt.batch) {
    playbooks.push(opt.batch);
  }
  if (opt.playbook) {
    playbooks.push("userPlaybook");
  }
  return playbooks;
}

/**
 * Return array of playbooks name which should be run on each node.
 */
function getLocalPlaybookNames(opt) {
  const playbooks = ["setupHostbasedAuth"];
  if (opt.batch === "pbspro") {
    playbooks.push("installPBSPro");
  }
  return playbooks;
}

function getRoleNames(opt) {
  const shareStorage = opt.shareStorage;
  const batch = opt.batch;

  const roleNames = ["so5.ssh_hostbased_auth"];
  if (shareStorage) {
    roleNames.push("geerlingguy.nfs", "andrewrothstein.nfs-client");
  }
  if (batch === "pbspro") {
    roleNames.push("so5.pbspro");
  }
  return roleNames;
}

module.exports = {
  ansibleConfig,
  getPlaybook,
  getPlaybookNames,
  getLocalPlaybookNames,
  getRoleNames
};
