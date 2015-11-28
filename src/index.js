const NEW_API_FIREFOX_VERSION = 44;
const ONE_SECOND_IN_MILLISECONDS = 1000;
const URL_CHARS_LIMIT = 2000;

const { PrefsTarget } = require('sdk/preferences/event-target');
const { setInterval, clearInterval } = require('sdk/timers');
const { version } = require('sdk/system/xul-app');
const clipboard = require('sdk/clipboard');
const preferencesService = require('sdk/preferences/service');
const prefsTarget = PrefsTarget({ branchName: 'browser.startup.'});
const simplePrefs = require('sdk/simple-prefs');

const newtaboverride = {
  lastClipboardUrl : false,
  timer : false,

  init : function () {
    newtaboverride.onPrefChange();
  },

  override : function (newTabUrl) {
    if (version < NEW_API_FIREFOX_VERSION) {
      require('resource:///modules/NewTabURL.jsm').NewTabURL.override(newTabUrl);
    } else {
      const { Cc, Ci } = require('chrome');
      const aboutNewTabService = Cc['@mozilla.org/browser/aboutnewtab-service;1'].getService(Ci.nsIAboutNewTabService);

      aboutNewTabService.newTabURL = newTabUrl;
    }
  },

  reset : function () {
    if (version < NEW_API_FIREFOX_VERSION) {
      require('resource:///modules/NewTabURL.jsm').NewTabURL.reset();
    } else {
      const { Cc, Ci } = require('chrome');
      const aboutNewTabService = Cc['@mozilla.org/browser/aboutnewtab-service;1'].getService(Ci.nsIAboutNewTabService);

      aboutNewTabService.resetNewTabURL();
    }
  },
  
  onPrefChange : function () {
    var type = simplePrefs.prefs['type'];
    var newTabUrl;

    switch (type) {
      case 'about:blank':
      case 'about:home':
      case 'about:newtab':
        newTabUrl = type;
        break;
      case 'clipboard':
        newTabUrl = 'about:blank';
        // unfortunately there is no "clipboard changed" event…
        newtaboverride.timer = setInterval(newtaboverride.clipboardAction, ONE_SECOND_IN_MILLISECONDS / 2);
        break;
      case 'custom_url':
        if (!simplePrefs.prefs['url'] || simplePrefs.prefs['url'] === '') {
          newTabUrl = 'about:blank';
        } else {
          newTabUrl = simplePrefs.prefs['url'];
        }
        break;
      case 'homepage':
        var homepage = preferencesService.getLocalized('browser.startup.homepage', 'about:blank').split('|')[0];
        newTabUrl = homepage;
        break;
      default:
        newTabUrl = 'about:newtab';
    }

    if (type !== 'clipboard') {
      clearInterval(newtaboverride.timer);
      newtaboverride.lastClipboardUrl = false;
    }

    newtaboverride.override(newTabUrl);
  },

  clipboardAction : function () {
    var clipboardContent = clipboard.get();

    if (clipboard.currentFlavors.indexOf('text') === -1) {
      return;
    }

    if (clipboardContent.length > URL_CHARS_LIMIT || !newtaboverride.isUrl(clipboardContent)) {
      return;
    }

    if (!newtaboverride.lastClipboardUrl || clipboardContent !== newtaboverride.lastClipboardUrl) {
      newtaboverride.override(clipboardContent);
      newtaboverride.lastClipboardUrl = clipboardContent;
    }
  },

  /**
   * @see http://stackoverflow.com/a/9284473
   */
  isUrl : function (string) {
    var regexp = /^(?:(?:https?):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/i;
    return regexp.test(string);
  }
};

const main = () => {
  newtaboverride.init();

  simplePrefs.on('', newtaboverride.onPrefChange);
  prefsTarget.on('homepage', newtaboverride.onPrefChange);
};

exports.main = main;

exports.onUnload = function (reason) {
  if (reason === 'uninstall' || reason === 'disable') {
    clearInterval(newtaboverride.timer);
    newtaboverride.lastClipboardUrl = false;
    newtaboverride.reset();
  }
};
