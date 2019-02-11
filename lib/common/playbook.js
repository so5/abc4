"use strict";
const staticPlaybooks = {};
staticPlaybooks.test = `\
- hosts: all
  tasks:
    - debug: msg="hoge"
    - copy:
        dest: "/tmp/hoge"
        content: "hoge"
`;
staticPlaybooks.nfs = `\
- hosts: head
  become: yes
  vars:
    private_network: "*"
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
staticPlaybooks.pbspro = `\
- hosts: head
  become: yes
  vars:
    pbspro_server: True
    pbspro_prefix: "/usr/local"
  roles:
    - { "role": "so5.pbspro" }
- hosts: child
  become: yes
  vars:
    pbspro_server: False
    pbspro_prefix: "/usr/local"
  roles:
    - { "role": "so5.pbspro" }
`;

/**
 * return playbook
 * @param {string} name - name of playbook
 * @returns {string} - contens of playbook
 */
function getPlaybook(name) {
  return staticPlaybooks[name]; //this statement is fall back, so if name is invaid, this function returns undefined
}

module.exports = {
  getPlaybook
};
