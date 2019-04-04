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

function getSshdConf(isChild = false) {
  const sshdConfOnlyForChild = `\
PubkeyAuthentication no
AuthenticationMethods hostbased
`;
  const sshdConf = `\
HostbasedAuthentication yes
PermitRootLogin prohibit-password
IgnoreRhosts no
Port 22
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_dsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key
UsePrivilegeSeparation yes
KeyRegenerationInterval 3600
ServerKeyBits 1024
SyslogFacility AUTH
LogLevel INFO
LoginGraceTime 120
StrictModes yes
RSAAuthentication yes
PubkeyAuthentication yes
RhostsRSAAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
PasswordAuthentication no
X11Forwarding yes
X11DisplayOffset 10
PrintMotd no
PrintLastLog yes
TCPKeepAlive yes
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
UsePAM yes
`;
  return isChild ? sshdConf + sshdConfOnlyForChild : sshdConf;
}

function getSshConf() {
  return `\
HostBasedAuthentication yes
EnableSSHKeysign yes
NoHostAuthenticationForLocalhost yes
Host *
    SendEnv LANG LC_*
    HashKnownHosts yes
    GSSAPIAuthentication yes
    GSSAPIDelegateCredentials no
`;
}

/**
 * return shell script to change owner, group and permission
 * @param {string} path - filepath to be changed
 * @param {string} owner - owner name
 * @param {string} group - group name
 * @param {string} mode - permission mode (e.g. 744, ug=rwx)
 * @returns {string} - shell script content
 */
function changePermission(path, owner, group, mode) {
  return `${chown(owner, group, path)} && ${chmod(mode, path)}`;
}

/**
 * return shell script which call ssh-keyscan over hostnames on specified hostList file
 * @param {string} hostList - filename of hostList
 * @param {string} knownHosts - result filename
 * @param {string} owner - owner name of knowHosts
 * @param {string} group - group name of knowHosts
 * @param {string} mode - permission mode of knowHosts (e.g. 744, ug=rwx)
 * @returns {string} - shell script content
 */
function keyScan(hostList, knownHosts, owner, group, mode) {
  let rt = `\
for i in \`cat ${hostList}\`;do
  ssh-keyscan $i >> ${knownHosts}
done
`;
  rt += changePermission(knownHosts, owner, group, mode);
  return rt;
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
 * @param {string} opt.shostsEquiv - absolute path of shosts.equiv file
 * @param {string[]} opt.makeShostsEquiv - scripts to make shosts.equiv file
 * @param {string[]} opt.packages - package names to be installed
 */
function getUserData(opt, isChild) {
  opt.inventory = opt.inventory || "/etc/ansible/hosts"; //ansible's defalut path
  opt.shostsEquiv = opt.shostsEquiv || "/etc/ssh/shosts.equiv"; //default for ubuntu
  opt.playbookDir = "/var/lib/abc4"; //fixed value!

  const sshdConf = "/etc/ssh/sshd_config";
  const sshConf = "/etc/ssh/ssh_config";
  const knownHosts = "/etc/ssh/ssh_known_hosts";

  const userData = {
    runcmd: [
      ...opt.makeShostsEquiv,
      "echo make shots.equiv done `date`",
      keyScan(opt.shostsEquiv, `~${opt.user}/.ssh/known_hosts`, opt.user, opt.group, 644),
      keyScan(opt.shostsEquiv, knownHosts, "root", "root", 644),
      "echo key scan done `date`",
      changePermission(getSshKeySignPath(opt.os), "root", "root", "04755"),
      "echo ssh host based authentication enabled `date`"
    ]
  };
  if (Array.isArray(opt.packages)) {
    userData.packages = opt.packages;
  }
  userData.write_files = [
    {
      path: sshdConf,
      mode: 644,
      content: `${getSshdConf(isChild)}`
    },
    {
      path: sshConf,
      mode: 644,
      content: `${getSshConf(isChild)}`
    }
  ];

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
