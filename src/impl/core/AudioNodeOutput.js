"use strict";

const AudioBus = require("./AudioBus");

class AudioNodeOutput {
  constructor(opts) {
    let node = opts.node;
    let index = opts.index;
    let numberOfChannels = opts.numberOfChannels;
    let enabled = opts.enabled;

    this.node = node;
    this.index = index|0;
    this._audioBus = new AudioBus(numberOfChannels, node.processingSizeInFrames, node.sampleRate);
    this._inputs = [];
    this._enabled = !!enabled;
  }

  getAudioBus() {
    return this._audioBus;
  }

  getNumberOfChannels() {
    return this._audioBus.getNumberOfChannels();
  }

  setNumberOfChannels(numberOfChannels) {
    /* istanbul ignore else */
    if (numberOfChannels !== this.getNumberOfChannels()) {
      const channelInterpretation = this.node.getChannelInterpretation();

      this._audioBus.setNumberOfChannels(numberOfChannels, channelInterpretation);

      this._inputs.forEach((input) => {
        input.updateNumberOfChannels();
      });
    }
  }

  getNumberOfConnections() {
    return this._inputs.length;
  }

  isEnabled() {
    return this._enabled;
  }

  enable() {
    /* istanbul ignore else */
    if (!this._enabled) {
      this._enabled = true;
      this._inputs.forEach((input) => {
        input.enableFrom(this);
      });
    }
  }

  disable() {
    /* istanbul ignore else */
    if (this._enabled) {
      this._enabled = false;
      this._inputs.forEach((input) => {
        input.disableFrom(this);
      });
    }
  }

  zeros() {
    this._audioBus.zeros();
  }

  connect(destination, input) {
    const target = destination.getInput(input);

    if (this._inputs.indexOf(target) === -1) {
      this._inputs.push(target);
      target.connectFrom(this);
    }
  }

  disconnect() {
    const args = Array.from(arguments);
    const isTargetToDisconnect =
      args.length === 1 ? target => target.node === args[0] :
      args.length === 2 ? target => target.node === args[0] && target.index === args[1] :
      () => true;

    for (let i = this._inputs.length - 1; i >= 0; i--) {
      const target = this._inputs[i];

      if (isTargetToDisconnect(target)) {
        target.disconnectFrom(this);
        this._inputs.splice(i, 1);
      }
    }
  }

  isConnectedTo() {
    const args = Array.from(arguments);

    if (args.length === 1) {
      return this._inputs.some(target => target.node === args[0]);
    }
    if (args.length === 2) {
      return this._inputs.some(target => target.node === args[0] && target.index === args[1]);
    }

    return false;
  }

  pull(e) {
    this.node.processIfNecessary(e);
    return this._audioBus;
  }
}

module.exports = AudioNodeOutput;
