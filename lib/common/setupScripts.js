"use strict";
const { ansibleConfig, getPlaybook, getPlaybookNames, getRoleNames, getHostbasedAuthPlaybook } = require("./playbook");

//private functions
/*eslint-disable valid-jsdoc,require-jsdoc */

/**
 * Return shell script to install ansible.
 * Https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html#latest-release-via-dnf-or-yum.
 * @param {string} os - OS identifier.
 * @returns {string} Shell script to install ansible.
 */
function installAnsible(os) {
  let rt;
  if (os.startsWith("ubuntu")) {
    rt = `\
sudo apt-get update
sudo apt-get install software-properties-common
sudo apt-add-repository --yes --update ppa:ansible/ansible
sudo apt-get -y  install ansible python-dnspython`;
  } else if (/(?:centos|rhel)7/.test(os)) {
    rt = `\
echo sudo subscription-manager repos --enable rhel-7-server-ansible-2.6-rpms
echo sudo yum -y install ansible python2-dns
`;
  } else {
    rt = `\
echo "fall-back to pip"
echo sudo pip install ansible dnspython
`;
  }
  return rt;
}


function pullRolesFromGalaxy(opt) {
  const roles = getRoleNames(opt);
  return roles.length > 0 ? `ansible-galaxy install -p/etc/ansible/roles ${roles.join(" ")}` : "echo no roles on ansible-galaxy needed";
}

function runPlaybooks(opt) {
  const user = opt.user;
  const playbookDir = opt.playbookDir;
  const userPlaybook = opt.playbook;

  const playbooks = getPlaybookNames(opt);
  if (userPlaybook) {
    playbooks.push("userPlaybook");
  }
  if (playbooks.length === 0) {
    return "echo nothing to play at this time";
  }
  return `sudo -i -u ${user} ansible-playbook -f 1 --ssh-common-args="-oControlMaster=auto -oControlPath=/tmp/ -oControlPersist=60m -oPreferredAuthentications=hostbased"\
    --timeout=3600 ${playbooks.map((e)=>{
    return `${playbookDir}/${e}.yml`;
  }).join(" ")}`;
}

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
/**
 * Return userData object.
 * @param {Object} opt - Option argument.
 * @param {string} opt.inventory - Absolute path of inventory file.
 * @param {string} opt.shostsEquiv - Absolute path of shosts.equiv file.
 * @param {string[]} opt.makeShostsEquiv - Scripts to make shosts.equiv file.
 * @param {string[]} opt.packages - Package names to be installed.
 * @param {boolean} isChild - Return userdata for child node or not.
 * @returns {Object} - User data object.
 */
function getUserData(opt, isChild) {
  opt.inventory = opt.inventory || "/etc/ansible/hosts"; //ansible's defalut path
  opt.config = opt.config || "/etc/ansible/ansible.cfg"; //ansible's defalut path
  opt.shostsEquiv = opt.shostsEquiv || "/etc/ssh/shosts.equiv"; //default for ubuntu
  //following filenames are fixed values!!
  opt.playbookDir = "/var/lib/abc4";
  opt.ipListFile = "/var/lib/abc4/iplist";
  opt.hostListFile = "/var/lib/abc4/hostlist";

  const userData = {
    runcmd: [
      `${opt.createIpList} > ${opt.ipListFile}`,
      `${opt.createHostList} > ${opt.hostListFile}`,
      "echo create IP list file done",
      installAnsible(opt.os),
      "echo install ansible done",
      pullRolesFromGalaxy(opt),
      "echo pull roles from ansible-galaxy done",
      `sudo -i -u ${opt.user} ansible-playbook ${opt.playbookDir}/setupHostbasedAuth.yml --extra-vars="{ssh_hostbased_auth_permit_root_login: yes, ssh_hostbased_auth_allowed_hosts: [\`sed 's/.*/"&"/' ${opt.ipListFile} | tr '\\n' ',' |sed 's/,$//'\`]}"`,
      "echo setup ssh hostbased auth done",
      `cp /etc/ssh/ssh_known_hosts ~${opt.user}/.ssh/known_hosts`,
      "echo copy known hosts file done"
    ]
  };
  userData.write_files = [
    {
      path: `${opt.playbookDir}/setupHostbasedAuth.yml`,
      mode: 644,
      content: `${getHostbasedAuthPlaybook()}`
    },
    {
      path: `${opt.config}`,
      mode: 644,
      content: `${ansibleConfig}`
    }
  ];

  if (Array.isArray(opt.packages)) {
    userData.packages = opt.packages;
  }
  const makeInventory = [
    `echo '[head]' > ${opt.inventory}`,
    `hostname >> ${opt.inventory}`,
    `echo '[child]' >> ${opt.inventory}`,
    `grep -v -e \`hostname\` ${opt.hostListFile} >> ${opt.inventory}`,
    `chmod +r ${opt.inventory}`,
    "echo generate inventory file done",
    `cat ${opt.inventory}`
  ];

  if (!isChild) {
    userData.runcmd.push(
      ...makeInventory,
      "echo make inventory file done",
      "mkdir /etc/ansible/facts && chmod 777 /etc/ansible/facts",
      runPlaybooks(opt),
      "echo run playbooks done",
    );

    userData.write_files = userData.write_files.concat(
      getPlaybookNames(opt).map((e)=>{
        const option = {};
        if (e === "pbspro") {
          option.useServer = opt.runJobOnBatchServer;
          option.qmgrCmds = ["set server job_history_enable=True"];

          if (Array.isArray(opt.batchSetupScript) && opt.batchSetupScript.length > 0) {
            option.qmgrCmds.push(...opt.batchSetupScript);
          }
        }
        return {
          path: `${opt.playbookDir}/${e}.yml`,
          mode: 755,
          content: `${getPlaybook(e, option)}`
        };
      })
    );

    if (opt.playbook) {
      userData.write_files.push({
        path: `${opt.playbookDir}/userPlaybook.yml`,
        mode: 755,
        content: `${opt.playbook}`
      });
    }
  }
  return userData;
}

module.exports = {
  getUserData
};
