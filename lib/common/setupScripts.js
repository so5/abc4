"use strict";

//private functions
/*eslint-disable valid-jsdoc require-jsdoc */
function chown(owner, group, path) {
  return `chown ${owner}:${group} ${path}`;
}

function chmod(mode, path) {
  return `chmod ${mode} ${path}`;
}

function restartDaemon(daemon, isSystemd) {
  if (isSystemd) {
    return `systemctl restart ${daemon}`;
  }
  return `service ${daemon} restart`;
}

function modifySshdConf(sshdConf) {
  return `\
if head -n1 ${sshdConf} | grep -qv 'HostbasedAuthentication yes';then
  mv ${sshdConf} ${sshdConf}.org
  sed '1iHostbasedAuthentication yes\\nPermitRootLogin no\\n\\n'  ${sshdConf}.org > ${sshdConf}
fi`;
}

function modifySshConf(sshConf) {
  return `\
if head -n1 ${sshConf} | grep -qv 'HostbasedAuthentication yes';then
  mv ${sshConf} ${sshConf}.org
  sed '1iHostBasedAuthentication yes\\nEnableSSHKeysign yes\\nNoHostAuthenticationForLocalhost yes\\n' ${sshConf}.org > ${sshConf}
fi`;
}

//public functions
/*eslint-enable valid-jsdoc require-jsdoc*/
/**
 * return array of scripts which will setup ssh hostbased authentication
 * @param {Object} opt - option argument
 * @param {string} opt.shostsEquiv - absolute path of shosts.equiv
 * @param {string} opt.knownHosts  - absolute path of ssh_known_hosts for sshd
 * @param {string} opt.sshdConf - absolute path of sshd_conf
 * @param {string} opt.sshConf - absolute path of ssh_conf
 * @param {string} opt.keySign - absolute path of ssh-keysign
 * @param {boolean} opt.isSystemd - true if target system using systemd
 * @returns {string[]} - array of scripts which set up hostbased authentication
 */
function getSshHostBasedAutScript(opt={}) {
  const sshdConf = opt.sshdConf || "/etc/ssh/sshd_config";
  const sshConf = opt.sshConf || "/etc/ssh/ssh_config";
  const shostsEquiv = opt.shostsEquiv || "/etc/ssh/shosts.equiv";
  const knownHosts = opt.knownHosts || "/etc/ssh/ssh_known_hosts";
  const keySign = opt.keySign || "/usr/libexec/openssh/ssh-keysign";
  const isSystemd = opt.isSystemd || true;

  return [
    keyScan(shostsEquiv, knownHosts),
    modifySshdConf(sshdConf),
    modifySshConf(sshConf),
    changePermission(keySign, "root", "root", "04755"),
    restartDaemon("sshd", isSystemd)
  ];
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

  if (user && group) {
    rt += chown(user, group, knownHosts);
  }
  if (mode) {
    rt += chmod(mode, knownHosts);
  }

  return rt;
}

module.exports = {
  getSshHostBasedAutScript,
  changePermission,
  keyScan
};
