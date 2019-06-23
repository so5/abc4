"use strict";
const { ansibleConfig, getPlaybook, getPlaybookNames, getLocalPlaybookNames, getRoleNames } = require("./playbook");

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

function runLocalPlaybooks(opt) {
  const playbooks = getLocalPlaybookNames(opt);
  if (playbooks.length === 0) {
    return "echo nothing to play at this time";
  }
  return `sudo -i -u ${opt.user} ANSIBLE_CONFIG=${opt.config} ansible-playbook --extra-vars="{ssh_hostbased_auth_allowed_hosts: [\`sed 's/.*/"&"/' ${opt.ipListFile} | tr '\\n' ',' |sed 's/,$//'\`]}"\
    ${playbooks.map((e)=>{
    return `${opt.playbookDir}/${e}.yml`;
  }).join(" ")}`;
}

function runPlaybooks(opt) {
  const playbooks = getPlaybookNames(opt);
  if (playbooks.length === 0) {
    return "echo nothing to play at this time";
  }
  return `sudo -i -u ${opt.user} ANSIBLE_CONFIG=${opt.config} ansible-playbook ${playbooks.map((e)=>{
    return `${opt.playbookDir}/${e}.yml`;
  }).join(" ")}`;
}

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
/**
 * Return userData object.
 * @param {Object} opt - Option argument.
 * @param {string} opt.inventory - Absolute path of inventory file.
 * @param {string[]} opt.packages - Package names to be installed.
 * @param {boolean} isChild - Return userdata for child node or not.
 * @returns {Object} - User data object.
 */
function getUserData(opt, isChild) {
  opt.inventory = opt.inventory || "/etc/ansible/hosts"; //ansible's defalut path
  //following filenames are fixed values!!
  opt.playbookDir = "/var/lib/abc4";
  opt.ipListFile = "/var/lib/abc4/iplist";
  opt.hostListFile = "/var/lib/abc4/hostlist";
  opt.headHostName = "/var/lib/abc4/headnode";
  opt.config = `${opt.playbookDir}/ansible.cfg`;
  opt.isChild = isChild;

  if (opt.batch === "pbspro") {
    opt.qmgrCmds = ["set server job_history_enable=True"];

    if (Array.isArray(opt.batchSetupScript) && opt.batchSetupScript.length > 0) {
      opt.qmgrCmds.push(...opt.batchSetupScript);
    }
  }

  const makeInventory = [
    `echo '[head]' > ${opt.inventory}`,
    `cat ${opt.headHostName} >> ${opt.inventory}`,
    `echo '[child]' >> ${opt.inventory}`,
    `grep -v -e \`cat ${opt.headHostName}\` ${opt.hostListFile} >> ${opt.inventory}`,
    `chmod +r ${opt.inventory}`,
    "echo generate inventory file done",
    `cat ${opt.inventory}`
  ];

  const userData = {
    runcmd: [
      `${opt.createIpList} > ${opt.ipListFile}`,
      `${opt.createHostList} > ${opt.hostListFile}`,
      `${opt.getHeadHostname} > ${opt.headHostName}`,
      "echo create IP list file done `date`",
      installAnsible(opt.os),
      "echo install ansible done `date`",
      ...makeInventory,
      "mkdir /etc/ansible/facts && chmod 777 /etc/ansible/facts",
      pullRolesFromGalaxy(opt),
      "echo pull roles from ansible-galaxy done `date`",
      runLocalPlaybooks(opt),
      "echo run local playbook done`date`",
      `cp /etc/ssh/ssh_known_hosts ~${opt.user}/.ssh/known_hosts`,
      "echo copy known hosts file done"
    ]
  };
  userData.write_files = [
    {
      path: `${opt.playbookDir}/ansible.cfg`,
      mode: 644,
      content: `${ansibleConfig}`
    },
    ...getLocalPlaybookNames(opt).map((e)=>{
      return {
        path: `${opt.playbookDir}/${e}.yml`,
        mode: 755,
        content: `${getPlaybook(e, opt)}`
      };
    })
  ];

  if (Array.isArray(opt.packages)) {
    userData.packages = opt.packages;
  }

  if (!isChild) {
    userData.runcmd.push(
      "echo make inventory file done `date`",
      runPlaybooks(opt),
      "echo run playbooks done `date`",
    );

    userData.write_files = userData.write_files.concat(
      getPlaybookNames(opt).map((e)=>{
        return {
          path: `${opt.playbookDir}/${e}.yml`,
          mode: 755,
          content: `${getPlaybook(e, opt)}`
        };
      })
    );
  }
  return userData;
}

module.exports = {
  getUserData
};
