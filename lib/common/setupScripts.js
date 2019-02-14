"use strict";
const { getPlaybookNames, getRoleNames } = require("./playbook");

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

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
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
    modifySshConf(sshConf),
    changePermission(getSshKeySignPath(os), "root", "root", "04755"),
    restartDaemon("sshd", os)
  ];
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

function installAnsible(os) {
  let rt;
  if (os.startsWith("ubuntu")) {
    rt = `\
sudo apt-get update
sudo apt-get install software-properties-common
sudo apt-add-repository --yes --update ppa:ansible/ansible
sudo apt-get -y  install ansible`;
  } else {
    rt = `\

`;
  }
  return rt;
}


function runPlaybooks(user, playbookDir, shareStorage, batch, mpi, compiler) {
  const pullRolesFromGalaxy = `ansible-galaxy install -p/etc/ansible/roles ${getRoleNames(shareStorage, batch, mpi).join(" ")}`;
  const playbooks = getPlaybookNames(shareStorage, batch, mpi, compiler);
  const runPlaybook = `sudo -i -u ${user} ansible-playbook -f 100 --ssh-common-args="-oControlMaster=auto -oControlPath=/tmp/ -oControlPersist=30m -oPreferredAuthentications=hostbased" --timeout=1800 ${playbooks.map((e)=>{
    return `${playbookDir}/${e}.yml`;
  }).join(" ")}`;


  return [pullRolesFromGalaxy, runPlaybook];
}

module.exports = {
  enableSshHostBasedAuthentication,
  keyScan,
  installAnsible,
  runPlaybooks
};
