'use strict';

// Minimal Chrome/Firefox Native Messaging framing with bounded input.

const stream = require('stream');
const util = require('util');

function Input(options = {}) {
  stream.Transform.call(this);

  this._writableState.objectMode = false;
  this._readableState.objectMode = true;

  this.buf = Buffer.alloc(0);
  this.len = null;
  this.maxMessageBytes = options.maxMessageBytes || 1024 * 1024;
}

util.inherits(Input, stream.Transform);

Input.prototype._transform = function(chunk, encoding, done) {
  this.buf = Buffer.concat([this.buf, chunk]);

  try {
    while (true) {
      if (this.len === null) {
        if (this.buf.length < 4) {
          break;
        }
        this.len = this.buf.readUInt32LE(0);
        this.buf = this.buf.subarray(4);

        if (this.len === 0 || this.len > this.maxMessageBytes) {
          throw new Error(`Native message length ${this.len} is not permitted`);
        }
      }

      if (this.buf.length < this.len) {
        break;
      }

      const message = this.buf.subarray(0, this.len);
      this.buf = this.buf.subarray(this.len);
      this.len = null;

      const obj = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(message));
      // null is a stream EOF sentinel, so reject it before push().
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('Native message must be a JSON object');
      }
      this.push(obj);
    }

    done();
  }
  catch (err) {
    done(err);
  }
};

/** Reject EOF mid-frame instead of silently discarding a partial request. */
Input.prototype._flush = function(done) {
  done(this.len !== null || this.buf.length ? new Error('Incomplete native message') : null);
};

function Output() {
  stream.Transform.call(this);
  this._writableState.objectMode = true;
  this._readableState.objectMode = false;
}

util.inherits(Output, stream.Transform);

Output.prototype._transform = function(chunk, encoding, done) {
  try {
    const buf = Buffer.from(JSON.stringify(chunk), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(buf.length, 0);
    this.push(len);
    this.push(buf);
    done();
  }
  catch (err) {
    done(err);
  }
};

function Transform(handler) {
  stream.Transform.call(this);
  this._writableState.objectMode = true;
  this._readableState.objectMode = true;
  this.handler = handler;
}

util.inherits(Transform, stream.Transform);

Transform.prototype._transform = function(msg, encoding, done) {
  try {
    this.handler(msg, this.push.bind(this), done);
  }
  catch (err) {
    done(err);
  }
};

exports.Input = Input;
exports.Output = Output;
exports.Transform = Transform;
