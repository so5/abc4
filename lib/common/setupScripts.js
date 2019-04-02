"use strict";
const { getPlaybook, getPlaybookNames, getRoleNames } = require("./playbook");

//private functions
/*eslint-disable valid-jsdoc,require-jsdoc */
function isSystemd(os) {
  if (/(centos|rhel)6/i.test(os)) {
    return false;
  }
  return true;
}

function getSshKeySignPath(os) {
  if (/^ubuntu/i.test(os)) {
    return "/usr/lib/openssh/ssh-keysign";
  }
  return "/usr/libexec/openssh/ssh-keysign";
}

function chown(owner, group, path) {
  return `chown ${owner}:${group} ${path}`;
}

function chmod(mode, path) {
  return `chmod ${mode} ${path}`;
}

function restartDaemon(daemon, os) {
  if (isSystemd(os)) {
    return `systemctl restart ${daemon}`;
  }
  return `service ${daemon} restart`;
}

function modifySshdConf(sshdConf, only) {
  return `\
if head -n1 ${sshdConf} | grep -qv 'HostbasedAuthentication yes';then
  mv ${sshdConf} ${sshdConf}.org
  sed '1iHostbasedAuthentication yes\\nPermitRootLogin prohibit-password\\nIgnoreRhosts no\\n${only ? "PubkeyAuthentication no \\nAuthenticationMethods hostbased\\n" : ""}\\n'  ${sshdConf}.org > ${sshdConf}
fi`;
}

function modifySshConf(sshConf) {
  return `\
if head -n1 ${sshConf} | grep -qv 'HostbasedAuthentication yes';then
  mv ${sshConf} ${sshConf}.org
  sed '1iHostBasedAuthentication yes\\nEnableSSHKeysign yes\\nNoHostAuthenticationForLocalhost yes\\n' ${sshConf}.org > ${sshConf}
fi`;
}

/**
 * return script to change owner, group and permission
 * @param {string} path - filepath to be changed
 * @param {string} owner - owner name
 * @param {string} group - group name
 * @param {string} mode - permission mode (e.g. 744, ug=rwx)
 * @returns {string} - shell script which will change owner and permission
 */
function changePermission(path, owner, group, mode) {
  return `${chown(owner, group, path)} && ${chmod(mode, path)}`;
}

function keyScan(hostList, knownHosts, user, group, mode) {
  let rt = `\
for i in \`cat ${hostList}\`;do
  ssh-keyscan $i >> ${knownHosts}
done
`;
  rt += changePermission(knownHosts, user, group, mode);
  return rt;
}


/**
 * return array of scripts which will setup ssh hostbased authentication
 * @param {string} os - os name
 * @returns {string[]} - array of scripts which set up hostbased authentication
 */
function enableSshHostBasedAuthentication(os, only) {
  const sshdConf = "/etc/ssh/sshd_config";
  const sshConf = "/etc/ssh/ssh_config";
  const shostsEquiv = "/etc/ssh/shosts.equiv";
  const knownHosts = "/etc/ssh/ssh_known_hosts";

  return [
    keyScan(shostsEquiv, knownHosts, "root", "root", 644),
    modifySshdConf(sshdConf, only),
    "echo rewrite sshd.conf done",
    `grep -v -e '^#' -e '^\\s*$' ${sshdConf}`,
    modifySshConf(sshConf),
    "echo rewrite ssh.conf done",
    `grep -v -e '^#' -e '^\\s*$' ${sshConf}`,
    changePermission(getSshKeySignPath(os), "root", "root", "04755"),
    "echo set permission of ssh-keysign ",
    restartDaemon("sshd", os),
    "echo restart sshd"
  ];
}

/**
 * return shell script to install ansible
 *   https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html#latest-release-via-dnf-or-yum
 */
function installAnsible(os) {
  let rt;
  if (os.startsWith("ubuntu")) {
    rt = `\
sudo apt-get update
sudo apt-get install software-properties-common
sudo apt-add-repository --yes --update ppa:ansible/ansible
sudo apt-get -y  install ansible`;
  } else if (/(?:centos|rhel)7/.test(os)) {
    rt = `\
echo sudo subscription-manager repos --enable rhel-7-server-ansible-2.6-rpms
echo sudo yum install ansible
`;
  } else {
    rt = `\
echo "fall-back to pip"
echo sudo pip install ansible
`;
  }
  return rt;
}


function pullRolesFromGalaxy(opt) {
  const roles = getRoleNames(opt);
  return `ansible-galaxy install -p/etc/ansible/roles ${roles.join(" ")}`;
}

function runPlaybooks(opt) {
  const user = opt.user;
  const playbookDir = opt.playbookDir;
  const userPlaybook = opt.playbook;

  const playbooks = getPlaybookNames(opt);
  if (userPlaybook) {
    playbooks.push("userPlaybook");
  }
  return `sudo -i -u ${user} ansible-playbook -f 100 --ssh-common-args="-oControlMaster=auto -oControlPath=/tmp/ -oControlPersist=30m -oPreferredAuthentications=hostbased" --timeout=1800 ${playbooks.map((e)=>{
    return `${playbookDir}/${e}.yml`;
  }).join(" ")}`;
}

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
/**
 *
 * @param {Object} opt - option argument
 * @param {string} opt.inventory - absolute path of inventory file
 * @param {string} opt.playbookDir - absolute path of playbook storage
 * @param {string} opt.shostsEquiv - absolute path of shosts.equiv file
 * @param {string[]} opt.makeShostsEquiv - scripts to make shosts.equiv file
 * @param {string[]} opt.packages - package names to be installed
 */
function getUserData(opt, isChild) {
  opt.inventory = opt.inventory || "/etc/ansible/hosts"; //ansible's defalut path
  opt.playbookDir = opt.playbookDir || "/var/abc4";
  opt.shostsEquiv = opt.shostsEquiv || "/etc/ssh/shosts.equiv"; //default for ubuntu

  const userData = {
    runcmd: [
      ...opt.makeShostsEquiv,
      "echo make shots.equiv done",
      ...enableSshHostBasedAuthentication(opt.os, isChild),
      "echo ssh host based authentication enabled",
      keyScan(opt.shostsEquiv, `~${opt.user}/.ssh/known_hosts`, opt.user, opt.group, 644),
      "echo key scan done"
    ]
  };
  if (Array.isArray(opt.packages)) {
    userData.packages = opt.packages;
  }

  const makeInventory = [
    `(echo '[head]'  &&\
    echo \`hostname\` &&\
    echo '[child]' &&\
    grep -v -e \`hostname\` -e '\\.' ${opt.shostsEquiv}) >> ${opt.inventory}`,
    `chmod +r ${opt.inventory}`,
    "echo generate inventory file done",
    `cat ${opt.inventory}`
  ];

  if (!isChild) {
    userData.runcmd.push(
      installAnsible(opt.os),
      "echo install ansible done",
      ...makeInventory,
      "echo make inventory file done",
      pullRolesFromGalaxy(opt),
      "echo pull roles from ansible-galaxy done",
      runPlaybooks(opt),
      "echo run playbooks done",
    );
    userData.write_files = getPlaybookNames(opt).map((e)=>{
      const option = {};
      if (e === "pbspro") {
        option.useServer = opt.runJobOnBatchServer;
        option.qmgrCmds = "set server job_history_enable=True";
      }
      return {
        path: `${opt.playbookDir}/${e}.yml`,
        mode: 755,
        content: `${getPlaybook(e, option)}`
      };
    });

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
