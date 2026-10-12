module.exports = function verifyCameraVersion(version) {
  if (version !== '57.0.6') {
    throw new Error('Expo Camera 57.0.6 is required for the capture patch.');
  }
};
