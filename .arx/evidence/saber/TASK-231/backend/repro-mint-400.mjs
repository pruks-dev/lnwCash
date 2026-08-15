// TASK-231 repro bundle — generated from repro-entry.ts (production modules, read-only). Run: node repro-mint-400.mjs
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod2) => function __require() {
  try {
    return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
  } catch (e) {
    throw mod2 = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));

// node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/_u64.js
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var U32_MASK64, _32n, fromNumH, fromNumL, shrSH, shrSL, rotrSH, rotrSL, rotrBH, rotrBL, add3L, add3H, add4L, add4H, add5L, add5H;
var init_u64 = __esm({
  "node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/_u64.js"() {
    U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
    _32n = /* @__PURE__ */ BigInt(32);
    fromNumH = (n) => n / 2 ** 32 | 0;
    fromNumL = (n) => n >>> 0;
    shrSH = (h, _l, s) => h >>> s;
    shrSL = (h, l, s) => h << 32 - s | l >>> s;
    rotrSH = (h, l, s) => h >>> s | l << 32 - s;
    rotrSL = (h, l, s) => h << 32 - s | l >>> s;
    rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
    rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
    add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
    add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
    add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
  }
});

// node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
  if (h.outputLen < 1 || h.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function rotl(word, shift) {
  return word << shift | word >>> 32 - shift >>> 0;
}
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : void 0;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  if (hasHexBuiltin) {
    try {
      return Uint8Array.fromHex(hex);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new RangeError(error.message);
      throw error;
    }
  }
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new TypeError("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function kdfInputToBytes(data, errorTitle = "") {
  if (typeof data === "string")
    return utf8ToBytes(data);
  return abytes(data, void 0, errorTitle);
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts, title = "opts") {
  aobject(defaults, "defaults");
  if (opts !== void 0)
    aobject(opts, title);
  const merged = Object.assign(defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  anumber(bytesLength, "bytesLength");
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (bytesLength > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var atitle, aobject, hasHexBuiltin, hexes, oidNist;
var init_utils = __esm({
  "node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/utils.js"() {
    atitle = (title) => title ? `"${title}" ` : "";
    aobject = (value, label) => {
      if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
    };
    hasHexBuiltin = /* @__PURE__ */ (() => (
      // @ts-ignore
      typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
    ))();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    oidNist = (suffix) => ({
      // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
      // Larger suffix values would need base-128 OID encoding and a different length byte.
      oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
    });
  }
});

// node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD, SHA256_IV, SHA512_IV;
var init_md = __esm({
  "node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/_md.js"() {
    init_u64();
    init_utils();
    HashMD = class {
      blockLen;
      outputLen;
      canXOF = false;
      padOffset;
      isLE;
      // For partial updates less than block size
      buffer;
      view;
      finished = false;
      length = 0;
      pos = 0;
      destroyed = false;
      constructor(blockLen, outputLen, padOffset, isLE) {
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        aexists(this);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        let processed = false;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            processed = true;
            continue;
          }
          buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
            processed = true;
          }
        }
        this.length += data.length;
        if (processed)
          this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        buffer.fill(0, pos);
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          buffer.fill(0);
        }
        setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
        this.process(view, 0);
        this.roundClean();
        const oview = out === buffer ? view : createView(out);
        const len = this.outputLen;
        const outLen = len / 4;
        const state = this.get();
        if (len % 4 || outLen > state.length)
          throw new Error("invalid outputLen");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneIntoMeta(to) {
        const { buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (pos)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA256_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
    SHA512_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      4089235720,
      3144134277,
      2227873595,
      1013904242,
      4271175723,
      2773480762,
      1595750129,
      1359893119,
      2917565137,
      2600822924,
      725511199,
      528734635,
      4215389547,
      1541459225,
      327033209
    ]);
  }
});

// node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/sha2.js
var SHA256_K, SHA256_W, SHA2_32B, _SHA256, K512, SHA512_Kh, SHA512_Kl, SHA512_W_H, SHA512_W_L, SHA2_64B, _SHA512, sha256, sha512;
var init_sha2 = __esm({
  "node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/sha2.js"() {
    init_md();
    init_u64();
    init_utils();
    SHA256_K = /* @__PURE__ */ Uint32Array.from([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    SHA2_32B = class extends HashMD {
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      // Numeric initializers matter: starting the fields as `undefined` changes
      // V8's field representation and makes sha256 3x slower (measured).
      A = 0;
      B = 0;
      C = 0;
      D = 0;
      E = 0;
      F = 0;
      G = 0;
      H = 0;
      constructor(outputLen, IV) {
        super(64, outputLen, 8, false);
        this.A = IV[0] | 0;
        this.B = IV[1] | 0;
        this.C = IV[2] | 0;
        this.D = IV[3] | 0;
        this.E = IV[4] | 0;
        this.F = IV[5] | 0;
        this.G = IV[6] | 0;
        this.H = IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
      }
      _cloneInto(to) {
        (to ||= new this.constructor()).set(...this.get());
        return this._cloneIntoMeta(to);
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
          const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
          const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
          const T2 = sigma0 + Maj(A, B, C) | 0;
          H = G;
          G = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G = G + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G, H);
      }
      roundClean() {
        clean(SHA256_W);
      }
      destroy() {
        this.destroyed = true;
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
      }
    };
    _SHA256 = class extends SHA2_32B {
      constructor() {
        super(32, SHA256_IV);
      }
    };
    K512 = /* @__PURE__ */ (() => split([
      "0x428a2f98d728ae22",
      "0x7137449123ef65cd",
      "0xb5c0fbcfec4d3b2f",
      "0xe9b5dba58189dbbc",
      "0x3956c25bf348b538",
      "0x59f111f1b605d019",
      "0x923f82a4af194f9b",
      "0xab1c5ed5da6d8118",
      "0xd807aa98a3030242",
      "0x12835b0145706fbe",
      "0x243185be4ee4b28c",
      "0x550c7dc3d5ffb4e2",
      "0x72be5d74f27b896f",
      "0x80deb1fe3b1696b1",
      "0x9bdc06a725c71235",
      "0xc19bf174cf692694",
      "0xe49b69c19ef14ad2",
      "0xefbe4786384f25e3",
      "0x0fc19dc68b8cd5b5",
      "0x240ca1cc77ac9c65",
      "0x2de92c6f592b0275",
      "0x4a7484aa6ea6e483",
      "0x5cb0a9dcbd41fbd4",
      "0x76f988da831153b5",
      "0x983e5152ee66dfab",
      "0xa831c66d2db43210",
      "0xb00327c898fb213f",
      "0xbf597fc7beef0ee4",
      "0xc6e00bf33da88fc2",
      "0xd5a79147930aa725",
      "0x06ca6351e003826f",
      "0x142929670a0e6e70",
      "0x27b70a8546d22ffc",
      "0x2e1b21385c26c926",
      "0x4d2c6dfc5ac42aed",
      "0x53380d139d95b3df",
      "0x650a73548baf63de",
      "0x766a0abb3c77b2a8",
      "0x81c2c92e47edaee6",
      "0x92722c851482353b",
      "0xa2bfe8a14cf10364",
      "0xa81a664bbc423001",
      "0xc24b8b70d0f89791",
      "0xc76c51a30654be30",
      "0xd192e819d6ef5218",
      "0xd69906245565a910",
      "0xf40e35855771202a",
      "0x106aa07032bbd1b8",
      "0x19a4c116b8d2d0c8",
      "0x1e376c085141ab53",
      "0x2748774cdf8eeb99",
      "0x34b0bcb5e19b48a8",
      "0x391c0cb3c5c95a63",
      "0x4ed8aa4ae3418acb",
      "0x5b9cca4f7763e373",
      "0x682e6ff3d6b2b8a3",
      "0x748f82ee5defb2fc",
      "0x78a5636f43172f60",
      "0x84c87814a1f0ab72",
      "0x8cc702081a6439ec",
      "0x90befffa23631e28",
      "0xa4506cebde82bde9",
      "0xbef9a3f7b2c67915",
      "0xc67178f2e372532b",
      "0xca273eceea26619c",
      "0xd186b8c721c0c207",
      "0xeada7dd6cde0eb1e",
      "0xf57d4f7fee6ed178",
      "0x06f067aa72176fba",
      "0x0a637dc5a2c898a6",
      "0x113f9804bef90dae",
      "0x1b710b35131c471b",
      "0x28db77f523047d84",
      "0x32caab7b40c72493",
      "0x3c9ebe0a15c9bebc",
      "0x431d67c49c100d4c",
      "0x4cc5d4becb3e42b6",
      "0x597f299cfc657e2a",
      "0x5fcb6fab3ad6faec",
      "0x6c44198c4a475817"
    ].map((n) => BigInt(n))))();
    SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
    SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
    SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
    SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
    SHA2_64B = class extends HashMD {
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      // h -- high 32 bits, l -- low 32 bits
      // Numeric initializers matter: starting the fields as `undefined` changes
      // V8's field representation and slows hashing down (measured on sha256).
      Ah = 0;
      Al = 0;
      Bh = 0;
      Bl = 0;
      Ch = 0;
      Cl = 0;
      Dh = 0;
      Dl = 0;
      Eh = 0;
      El = 0;
      Fh = 0;
      Fl = 0;
      Gh = 0;
      Gl = 0;
      Hh = 0;
      Hl = 0;
      constructor(outputLen, IV) {
        super(128, outputLen, 16, false);
        this.Ah = IV[0] | 0;
        this.Al = IV[1] | 0;
        this.Bh = IV[2] | 0;
        this.Bl = IV[3] | 0;
        this.Ch = IV[4] | 0;
        this.Cl = IV[5] | 0;
        this.Dh = IV[6] | 0;
        this.Dl = IV[7] | 0;
        this.Eh = IV[8] | 0;
        this.El = IV[9] | 0;
        this.Fh = IV[10] | 0;
        this.Fl = IV[11] | 0;
        this.Gh = IV[12] | 0;
        this.Gl = IV[13] | 0;
        this.Hh = IV[14] | 0;
        this.Hl = IV[15] | 0;
      }
      // prettier-ignore
      get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
      }
      // prettier-ignore
      set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
      }
      _cloneInto(to) {
        (to ||= new this.constructor()).set(...this.get());
        return this._cloneIntoMeta(to);
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4) {
          SHA512_W_H[i] = view.getUint32(offset);
          SHA512_W_L[i] = view.getUint32(offset += 4);
        }
        for (let i = 16; i < 80; i++) {
          const W15h = SHA512_W_H[i - 15] | 0;
          const W15l = SHA512_W_L[i - 15] | 0;
          const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
          const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
          const W2h = SHA512_W_H[i - 2] | 0;
          const W2l = SHA512_W_L[i - 2] | 0;
          const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
          const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
          const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
          const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
          SHA512_W_H[i] = SUMh | 0;
          SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        for (let i = 0; i < 80; i++) {
          const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
          const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
          const CHIh = Eh & Fh ^ ~Eh & Gh;
          const CHIl = El & Fl ^ ~El & Gl;
          const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
          const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
          const T1l = T1ll | 0;
          const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
          const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
          const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
          const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
          Hh = Gh | 0;
          Hl = Gl | 0;
          Gh = Fh | 0;
          Gl = Fl | 0;
          Fh = Eh | 0;
          Fl = El | 0;
          ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
          Dh = Ch | 0;
          Dl = Cl | 0;
          Ch = Bh | 0;
          Cl = Bl | 0;
          Bh = Ah | 0;
          Bl = Al | 0;
          const All = add3L(T1l, sigma0l, MAJl);
          Ah = add3H(All, T1h, sigma0h, MAJh);
          Al = All | 0;
        }
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
      }
      roundClean() {
        clean(SHA512_W_H, SHA512_W_L);
      }
      destroy() {
        this.destroyed = true;
        clean(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    _SHA512 = class extends SHA2_64B {
      constructor() {
        super(64, SHA512_IV);
      }
    };
    sha256 = /* @__PURE__ */ createHasher(
      () => new _SHA256(),
      /* @__PURE__ */ oidNist(1)
    );
    sha512 = /* @__PURE__ */ createHasher(
      () => new _SHA512(),
      /* @__PURE__ */ oidNist(3)
    );
  }
});

// node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/utils.js
function aarray(item, title, inner = () => {
}) {
  if (!Array.isArray(item))
    throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
  for (let i = 0; i < item.length; i++)
    inner(item[i], `${title}[${i}]`);
  return item;
}
function astring(value, title = "") {
  if (typeof value !== "string") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected string, got type=" + typeof value);
  }
  return value;
}
function aobject2(value, title = "object") {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(title === "object" ? "expected valid options object" : `"${title}" expected object, got type=${typeof value}`);
  return value;
}
function afunction(value, title) {
  if (typeof value !== "function")
    throw new TypeError(`"${title}" is invalid: expected function, got ${typeof value}`);
  return value;
}
function abool(value, title = "") {
  if (typeof value !== "boolean")
    throw new TypeError(atitle2(title) + "expected boolean, got type=" + typeof value);
  return value;
}
function abignumber(n) {
  if (typeof n === "bigint") {
    if (!isPosBig(n))
      throw new RangeError("positive bigint expected, got " + n);
  } else
    anumber2(n);
  return n;
}
function asafenumber(value, title = "") {
  if (typeof value !== "number") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected number, got type=" + typeof value);
  }
  if (!Number.isSafeInteger(value)) {
    const prefix = title && `"${title}" `;
    throw new RangeError(prefix + "expected safe integer, got " + value);
  }
}
function numberToHexUnpadded(num) {
  const hex = abignumber(num).toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  return hexToNumber(bytesToHex(copyBytes(abytes(bytes)).reverse()));
}
function numberToBytesBE(n, len) {
  anumber(len);
  if (len === 0)
    throw new Error("zero output length is invalid");
  n = abignumber(n);
  const expectedLen = len * 2;
  const hex = n.toString(16);
  if (hex.length > expectedLen)
    throw new RangeError("number is too large");
  return hexToBytes(hex.padStart(expectedLen, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function copyBytes(bytes) {
  return Uint8Array.from(abytes2(bytes));
}
function isPosBig(n) {
  return typeof n === "bigint" && _0n <= n;
}
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  if (n < _0n)
    throw new Error("expected non-negative bigint, got " + n);
  return n === _0n ? 0 : n.toString(2).length;
}
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  anumber(hashLen, "hashLen");
  anumber(qByteLen, "qByteLen");
  if (typeof hmacFn !== "function")
    throw new TypeError("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const NULL = Uint8Array.of();
  const byte0 = Uint8Array.of(0);
  const byte1 = Uint8Array.of(1);
  const _maxDrbgIters = 1e3;
  let v = u8n(hashLen);
  let k2 = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k2.fill(0);
    i = 0;
  };
  const h = (...msgs) => hmacFn(k2, concatBytes2(v, ...msgs));
  const reseed = (seed = NULL) => {
    k2 = h(byte0, seed);
    v = h();
    if (seed.length === 0)
      return;
    k2 = h(byte1, seed);
    v = h();
  };
  const gen = () => {
    if (i++ >= _maxDrbgIters)
      throw new Error("drbg: tried max amount of iterations");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while ((res = pred(gen())) === void 0)
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function validateObject(object, fields = {}, optFields = {}, title = "object") {
  aobject2(object, title);
  aobject2(fields, "fields");
  aobject2(optFields, "optFields");
  function checkField(fieldName, expectedType, isOpt) {
    const label = title === "object" ? `param "${String(fieldName)}"` : `"${title}.${String(fieldName)}"`;
    const val = object[fieldName];
    if (!Object.hasOwn(object, fieldName) && (isOpt ? val !== void 0 : expectedType !== "function")) {
      throw new TypeError(`${label} is invalid: expected own property`);
    }
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new TypeError(`${label} is invalid: expected ${expectedType}, got ${current}`);
  }
  const iter = (f, isOpt) => Object.entries(f).forEach(([k2, v]) => checkField(k2, v, isOpt));
  iter(fields, false);
  iter(optFields, true);
}
var abytes2, anumber2, bytesToHex2, concatBytes2, hexToBytes2, isBytes2, randomBytes2, _0n, _1n, atitle2, bitMask;
var init_utils2 = __esm({
  "node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/utils.js"() {
    init_utils();
    abytes2 = (value, length, title) => abytes(value, length, title);
    anumber2 = anumber;
    bytesToHex2 = bytesToHex;
    concatBytes2 = (...arrays) => concatBytes(...arrays);
    hexToBytes2 = (hex) => hexToBytes(hex);
    isBytes2 = isBytes;
    randomBytes2 = (bytesLength) => randomBytes(bytesLength);
    _0n = /* @__PURE__ */ BigInt(0);
    _1n = /* @__PURE__ */ BigInt(1);
    atitle2 = (title) => title ? `"${title}" ` : "";
    bitMask = (n) => {
      asafenumber(n, "n");
      return (_1n << BigInt(n)) - _1n;
    };
  }
});

// node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/modular.js
function mod(a, b) {
  if (b <= _0n2)
    throw new Error("mod: expected positive modulus, got " + b);
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow(num, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow: expected modulus > 1, got " + modulo);
  if (typeof power !== "bigint")
    throw new TypeError("invalid exponent: expected bigint, got " + typeof power);
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return _1n2;
  if (power === _1n2)
    return num;
  let d = num % modulo;
  if (d < _0n2)
    d += modulo;
  if (power < POW_WINDOWED_MIN) {
    let p2 = _1n2;
    while (power > _0n2) {
      if (power & _1n2)
        p2 = p2 * d % modulo;
      d = d * d % modulo;
      power >>= _1n2;
    }
    return p2;
  }
  const digits = [];
  while (power > _0n2) {
    digits.push(Number(power & _15n));
    power >>= _4n;
  }
  const table = new Array(16);
  table[0] = _1n2;
  table[1] = d;
  for (let i = 2; i < 16; i++)
    table[i] = table[i - 1] * d % modulo;
  let p = table[digits[digits.length - 1]];
  for (let w = digits.length - 2; w >= 0; w--) {
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    const digit = digits[w];
    if (digit !== 0)
      p = p * table[digit] % modulo;
  }
  return p;
}
function pow2(x, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow2: expected modulus > 1, got " + modulo);
  if (power < _0n2)
    throw new Error("pow2: expected non-negative exponent, got " + power);
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _1n2)
    throw new Error("invert: expected modulus > 1, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, u = _1n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b - a * q;
    const m = x - u * q;
    b = a, a = r, x = u, u = m;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function invertCt(a, prime) {
  if (prime <= _1n2)
    throw new Error("invertCt: expected prime modulus > 1, got " + prime);
  const an = mod(a, prime);
  if (an === _0n2)
    throw new Error("invertCt: expected non-zero number");
  const inverse = pow(an, prime - _2n, prime);
  if (mod(an * inverse, prime) !== _1n2)
    throw new Error("invertCt: does not exist");
  return inverse;
}
function assertIsSquare(Fp, root, n) {
  const F = Fp;
  if (!F.eql(F.sqr(root), n))
    throw new Error("Cannot find square root");
}
function aoddModulus(order, fnName) {
  if ((order & _1n2) === _0n2)
    throw new Error(fnName + ": expected odd modulus, got " + order);
}
function sqrt3mod4(Fp, n) {
  const F = Fp;
  const p1div4 = (F.ORDER + _1n2) / _4n;
  const root = F.pow(n, p1div4);
  assertIsSquare(F, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const F = Fp;
  const p5div8 = (F.ORDER - _5n) / _8n;
  const n2 = F.mul(n, _2n);
  const v = F.pow(n2, p5div8);
  const nv = F.mul(n, v);
  const i = F.mul(F.mul(nv, _2n), v);
  const root = F.mul(nv, F.sub(i, F.ONE));
  assertIsSquare(F, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return ((Fp, n) => {
    const F = Fp;
    let tv1 = F.pow(n, c4);
    let tv2 = F.mul(tv1, c1);
    const tv3 = F.mul(tv1, c2);
    const tv4 = F.mul(tv1, c3);
    const e1 = F.eql(F.sqr(tv2), n);
    const e2 = F.eql(F.sqr(tv3), n);
    tv1 = F.cmov(tv1, tv2, e1);
    tv2 = F.cmov(tv4, tv3, e2);
    const e3 = F.eql(F.sqr(tv2), n);
    const root = F.cmov(tv1, tv2, e3);
    assertIsSquare(F, root, n);
    return root;
  });
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  aoddModulus(P, "tonelliShanks");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    const F = Fp;
    if (F.is0(n))
      return n;
    if (FpLegendre(F, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = F.mul(F.ONE, cc);
    let t = F.pow(n, Q);
    let R = F.pow(n, Q1div2);
    while (!F.eql(t, F.ONE)) {
      if (F.is0(t))
        throw new Error("Cannot find square root: probably non-prime P");
      let i = 1;
      let t_tmp = F.sqr(t);
      while (!F.eql(t_tmp, F.ONE)) {
        i++;
        t_tmp = F.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = F.pow(c, exponent);
      M = i;
      c = F.sqr(b);
      t = F.mul(t, c);
      R = F.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  aoddModulus(P, "Fp.sqrt");
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
function validateField(field) {
  aobject2(field, "field");
  if (typeof field.ORDER !== "bigint")
    throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof field.ORDER);
  asafenumber(field.BYTES, "BYTES");
  asafenumber(field.BITS, "BITS");
  for (const name of FIELD_FIELDS)
    afunction(field[name], "field." + name);
  if (field.BYTES < 1 || field.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (field.ORDER <= _1n2)
    throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
  return field;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  validateField(Fp);
  aarray(nums, "nums");
  abool(passZero, "passZero");
  const F = Fp;
  const inverted = new Array(nums.length).fill(passZero ? F.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = acc;
    return F.mul(acc, num);
  }, F.ONE);
  const invertedAcc = F.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = F.mul(acc, inverted[i]);
    return F.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  validateField(Fp);
  const F = Fp;
  aoddModulus(F.ORDER, "FpLegendre");
  const p1mod2 = (F.ORDER - _1n2) / _2n;
  const powered = F.pow(n, p1mod2);
  const yes = F.eql(powered, F.ONE);
  const zero = F.eql(powered, F.ZERO);
  const no = F.eql(powered, F.neg(F.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber2(nBitLength);
  if (n <= _0n2)
    throw new Error("invalid n length: expected positive n, got " + n);
  if (nBitLength !== void 0 && nBitLength < 1)
    throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
  const bits = bitLen(n);
  if (nBitLength !== void 0 && nBitLength < bits)
    throw new Error(`invalid n length: expected nBitLength (${nBitLength}) >= bitLen(n) (${bits})`);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : bits;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, opts = {}) {
  Object.freeze(_Field.prototype);
  return new _Field(ORDER, opts);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  if (fieldOrder <= _1n2)
    throw new Error("field order must be greater than 1");
  const bitLength = bitLen(fieldOrder - _1n2);
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE = false) {
  abytes2(key);
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = Math.max(getMinHashLength(fieldOrder), 16);
  if (len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num = isLE ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num, fieldOrder - _1n2) + _1n2;
  return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}
var _0n2, _1n2, _2n, _3n, _4n, _5n, _7n, _8n, _9n, _15n, _16n, POW_WINDOWED_MIN, FIELD_FIELDS, FIELD_SQRT, _Field;
var init_modular = __esm({
  "node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/modular.js"() {
    init_utils2();
    _0n2 = /* @__PURE__ */ BigInt(0);
    _1n2 = /* @__PURE__ */ BigInt(1);
    _2n = /* @__PURE__ */ BigInt(2);
    _3n = /* @__PURE__ */ BigInt(3);
    _4n = /* @__PURE__ */ BigInt(4);
    _5n = /* @__PURE__ */ BigInt(5);
    _7n = /* @__PURE__ */ BigInt(7);
    _8n = /* @__PURE__ */ BigInt(8);
    _9n = /* @__PURE__ */ BigInt(9);
    _15n = /* @__PURE__ */ BigInt(15);
    _16n = /* @__PURE__ */ BigInt(16);
    POW_WINDOWED_MIN = /* @__PURE__ */ BigInt("0x10000000000000000");
    FIELD_FIELDS = [
      "create",
      "isValid",
      "is0",
      "neg",
      "inv",
      "sqrt",
      "sqr",
      "eql",
      "add",
      "sub",
      "mul",
      "pow",
      "div",
      "addN",
      "subN",
      "mulN",
      "sqrN"
    ];
    FIELD_SQRT = /* @__PURE__ */ new WeakMap();
    _Field = class {
      ORDER;
      BITS;
      BYTES;
      isLE;
      ZERO = _0n2;
      ONE = _1n2;
      _lengths;
      _mod;
      constructor(ORDER, opts = {}) {
        if (ORDER <= _1n2)
          throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
        let _nbitLength = void 0;
        this.isLE = false;
        if (opts != null && typeof opts === "object") {
          if (typeof opts.BITS === "number")
            _nbitLength = opts.BITS;
          if (typeof opts.sqrt === "function")
            Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
          if (typeof opts.isLE === "boolean")
            this.isLE = opts.isLE;
          if (opts.allowedLengths)
            this._lengths = Object.freeze(opts.allowedLengths.slice());
          if (typeof opts.modFromBytes === "boolean")
            this._mod = opts.modFromBytes;
        }
        const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
        if (nByteLength > 2048)
          throw new Error("invalid field: expected ORDER of <= 2048 bytes");
        this.ORDER = ORDER;
        this.BITS = nBitLength;
        this.BYTES = nByteLength;
        Object.freeze(this);
      }
      create(num) {
        return mod(num, this.ORDER);
      }
      isValid(num) {
        if (typeof num !== "bigint")
          throw new TypeError("invalid field element: expected bigint, got " + typeof num);
        return _0n2 <= num && num < this.ORDER;
      }
      is0(num) {
        return num === _0n2;
      }
      // is valid and invertible
      isValidNot0(num) {
        return !this.is0(num) && this.isValid(num);
      }
      isOdd(num) {
        return (num & _1n2) === _1n2;
      }
      neg(num) {
        return mod(-num, this.ORDER);
      }
      eql(lhs, rhs) {
        return lhs === rhs;
      }
      sqr(num) {
        return mod(num * num, this.ORDER);
      }
      add(lhs, rhs) {
        return mod(lhs + rhs, this.ORDER);
      }
      sub(lhs, rhs) {
        return mod(lhs - rhs, this.ORDER);
      }
      mul(lhs, rhs) {
        return mod(lhs * rhs, this.ORDER);
      }
      pow(num, power) {
        return pow(num, power, this.ORDER);
      }
      div(lhs, rhs) {
        return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
      }
      // Same as above, but doesn't normalize
      sqrN(num) {
        return num * num;
      }
      addN(lhs, rhs) {
        return lhs + rhs;
      }
      subN(lhs, rhs) {
        return lhs - rhs;
      }
      mulN(lhs, rhs) {
        return lhs * rhs;
      }
      inv(num) {
        return invert(num, this.ORDER);
      }
      sqrt(num) {
        let sqrt = FIELD_SQRT.get(this);
        if (!sqrt)
          FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
        return sqrt(this, num);
      }
      toBytes(num) {
        return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
      }
      fromBytes(bytes, skipValidation = false) {
        abytes2(bytes);
        const { _lengths: allowedLengths, BYTES, isLE, ORDER, _mod: modFromBytes } = this;
        if (allowedLengths) {
          if (bytes.length < 1 || !allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
            throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
          }
          const padded = new Uint8Array(BYTES);
          padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
          bytes = padded;
        }
        if (bytes.length !== BYTES)
          throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
        let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
        if (modFromBytes)
          scalar = mod(scalar, ORDER);
        if (!skipValidation) {
          if (!this.isValid(scalar))
            throw new Error("invalid field element: outside of range 0..ORDER");
        }
        return scalar;
      }
      // TODO: we don't need it here, move out to separate fn
      invertBatch(lst) {
        return FpInvertBatch(this, lst, true);
      }
      // We can't move this out because Fp6, Fp12 implement it
      // and it's unclear what to return in there.
      cmov(a, b, condition) {
        abool(condition, "condition");
        return condition ? b : a;
      }
    };
  }
});

// node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/curve.js
function validatePointCons(Point2) {
  const pc = Point2;
  if (typeof pc !== "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof Point2);
  afunction(pc.fromAffine, "Point.fromAffine");
  afunction(pc.fromBytes, "Point.fromBytes");
  afunction(pc.fromHex, "Point.fromHex");
  aobject2(pc.BASE, "Point.BASE");
  aobject2(pc.ZERO, "Point.ZERO");
  validateField(pc.Fp);
  validateField(pc.Fn);
}
function normalizeZ(c, points) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits, min = 1) {
  if (!Number.isSafeInteger(W) || W < min || W > bits)
    throw new Error("invalid window size, expected [" + min + ".." + bits + "], got W=" + W);
}
function validateTableBytes(numPoints, fpBytes) {
  const bytes = numPoints * (4 * fpBytes + 128);
  if (bytes > TABLE_BYTES_MAX)
    throw new Error("invalid window size: table would need ~" + Math.ceil(bytes / 2 ** 20) + " MiB, max " + TABLE_BYTES_MAX / 2 ** 20 + " MiB");
}
function probeRandomBytes(randomBytes3, length) {
  if (randomBytes3 === void 0)
    return void 0;
  afunction(randomBytes3, "randomBytes");
  try {
    const probe = randomBytes3(length);
    if (!isBytes2(probe) || probe.length !== length)
      return void 0;
  } catch {
    return void 0;
  }
  return randomBytes3;
}
function validateMSMPoints(points, c) {
  aarray(points, "points");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field, maxScalar) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    const ok = maxScalar === void 0 ? field.isValid(s) : isPosBig(s) && s < maxScalar;
    if (!ok)
      throw new Error("invalid scalar at index " + i);
  });
}
function getWindowSize(P) {
  return pointWindowSizes.get(P) || 1;
}
function oddMultiples(p, size) {
  const dbl = p.double();
  const t = [p];
  for (let j = 1; j < size; j++)
    t.push(t[j - 1].add(dbl));
  return t;
}
function wnafDigits(n, W) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const d = [];
  while (n > _0n3) {
    let w = 0;
    if (n & _1n3) {
      w = Number(n & mask);
      if (w >= half)
        w -= size;
      n -= BigInt(w);
    }
    d.push(w);
    n >>= _1n3;
  }
  return d;
}
function signedWindowDigits(n, W, windows) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const shiftBy = BigInt(W);
  const d = [];
  for (let w = 0; w < windows; w++) {
    let v = Number(n & mask);
    n >>= shiftBy;
    if (v > half) {
      v -= size;
      n += _1n3;
    }
    d.push(v);
  }
  if (n !== _0n3)
    throw new Error("invalid wnaf");
  return d;
}
function wnafWalk(zero, tables, digits) {
  let max = 0;
  for (const d of digits)
    max = Math.max(max, d.length);
  let acc = zero;
  for (let bit = max - 1; bit >= 0; bit--) {
    if (bit !== max - 1)
      acc = acc.double();
    for (let i = 0; i < digits.length; i++) {
      const w = digits[i][bit];
      if (w) {
        const item = tables[i][Math.abs(w) - 1 >> 1];
        acc = acc.add(w < 0 ? item.negate() : item);
      }
    }
  }
  return acc;
}
function mulAddUnsafe(c, points, scalars, allowOversized = false) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  abool(allowOversized, "allowOversized");
  validateMSMScalars(scalars, c.Fn, allowOversized ? c.Fn.ORDER ** _4n2 : void 0);
  if (points.length !== scalars.length)
    throw new Error("arrays of points and scalars must have equal length");
  const tables = points.map((p) => oddMultiples(p, 4));
  const digits = scalars.map((n) => wnafDigits(n, 4));
  return wnafWalk(c.ZERO, tables, digits);
}
function createField(order, field, isLE) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE });
  }
}
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (type !== "weierstrass" && type !== "edwards")
    throw new Error('expected curve type "weierstrass" or "edwards"');
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  validateObject(curveOpts);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(isPosBig(val) && val !== _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn3 = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn: Fn3 };
}
function createKeygen(randomSecretKey, getPublicKey2) {
  return function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey2(secretKey) };
  };
}
var _0n3, _1n3, _4n2, BLIND_BYTES, BLIND_BITS, FW_WINDOW, TABLE_BYTES_MAX, pointWindowSizes, ScalarMultiplier;
var init_curve = __esm({
  "node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/curve.js"() {
    init_utils2();
    init_modular();
    _0n3 = /* @__PURE__ */ BigInt(0);
    _1n3 = /* @__PURE__ */ BigInt(1);
    _4n2 = /* @__PURE__ */ BigInt(4);
    BLIND_BYTES = 16;
    BLIND_BITS = 128;
    FW_WINDOW = 5;
    TABLE_BYTES_MAX = /* @__PURE__ */ (() => 2 ** 31)();
    pointWindowSizes = /* @__PURE__ */ new WeakMap();
    ScalarMultiplier = class {
      Point;
      BASE;
      ZERO;
      randomBytes;
      wnafPrecomputes = /* @__PURE__ */ new WeakMap();
      baseCanBeBlinded;
      bits;
      // Parametrized with a given Point class (not individual point)
      constructor(Point2, randomBytes3) {
        validatePointCons(Point2);
        this.randomBytes = probeRandomBytes(randomBytes3, BLIND_BYTES);
        this.Point = Point2;
        this.BASE = Point2.BASE;
        this.ZERO = Point2.ZERO;
        this.bits = Point2.Fn.BITS;
      }
      /**
       * Creates a signed fixed-window wNAF precomputation table: for every window w, the
       * multiples `[1..2^(W−1)]⋅2^(w⋅W)⋅P`, flattened. All doublings are baked into the table,
       * so cached multiplication is additions-only. `windows = ceil(bits/W) + 1`: the extra
       * window absorbs the final carry of signed-digit recoding.
       * For a 256-bit curve and W=6, the table is 44⋅32 = 1408 points.
       * @param point - Point instance
       * @param W - window size
       * @param bits - scalar bitlength the table must cover
       */
      buildWnafTable(point, W, bits) {
        const windows = Math.ceil(bits / W) + 1;
        const half = 2 ** (W - 1);
        const comp = [];
        let base = point;
        for (let w = 0; w < windows; w++) {
          let acc = base;
          for (let i = 0; i < half; i++) {
            comp.push(acc);
            acc = acc.add(base);
          }
          base = comp[comp.length - 1].double();
        }
        return { W, bits, windows, comp };
      }
      /**
       * Implements ec multiplication using precomputed signed fixed-window wNAF tables.
       * Constant-time: fixed window count with one table addition per window — zero digits feed
       * the fake accumulator — and no doublings; the lookup scans the whole window slice.
       * Scalar bounds are validated by the public entry points ({@link ScalarMultiplier.mulCT},
       * {@link ScalarMultiplier.mulCTBlinded}, {@link ScalarMultiplier.mulUnsafe});
       * signedWindowDigits throws if `n` exceeds the table.
       * @returns real and fake (for const-time) points
       */
      wnafCachedCT(precomputes, n) {
        const { W, windows, comp } = precomputes;
        const half = 2 ** (W - 1);
        const digits = signedWindowDigits(n, W, windows);
        let p = this.ZERO;
        let f = this.BASE;
        for (let w = 0; w < windows; w++) {
          const digit = digits[w];
          const start = w * half;
          const idx = Math.abs(digit) - 1;
          let sel = comp[start];
          for (let i = 1; i < half; i++)
            sel = i === idx ? comp[start + i] : sel;
          const neg = sel.negate();
          if (digit === 0)
            f = f.add(comp[start]);
          else
            p = p.add(digit < 0 ? neg : sel);
        }
        return { p, f };
      }
      // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
      // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
      // incompatible `transform(...)` layouts and expect a separate cache entry.
      getWnafPrecomputes(W, point, bits, transform) {
        let entries = this.wnafPrecomputes.get(point);
        let comp = entries?.find((entry) => entry.W === W && entry.bits === bits);
        if (!comp) {
          comp = this.buildWnafTable(point, W, bits);
          if (typeof transform === "function")
            comp = { ...comp, comp: transform(comp.comp) };
          if (!entries) {
            entries = [];
            this.wnafPrecomputes.set(point, entries);
          }
          entries.push(comp);
        }
        return comp;
      }
      assertPoint(point) {
        if (!(point instanceof this.Point))
          throw new TypeError('"point" expected Point instance, got type=' + typeof point);
      }
      // Shared prologue of the constant-time entry points. Rejects scalar 0: in key/signature-style
      // callers a zero scalar means broken upstream plumbing, and concrete Points already reject it.
      // Uses inRange instead of Fn.isValidNot0: validateField() only certifies the arithmetic subset.
      validateMulInput(point, scalar) {
        this.assertPoint(point);
        if (!inRange(scalar, _1n3, this.Point.Fn.ORDER))
          throw new Error("invalid scalar");
      }
      // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
      // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
      // multiply. `n` must be < 2^bits.
      runCT(point, n, bits, transform) {
        const W = getWindowSize(point);
        if (W === 1)
          return this.fixedWindowCT(point, n, bits);
        return this.wnafCachedCT(this.getWnafPrecomputes(W, point, bits, transform), n);
      }
      mulCT(point, scalar, transform) {
        this.validateMulInput(point, scalar);
        return this.runCT(point, scalar, this.bits, transform);
      }
      mulCTBlinded(point, scalar, transform) {
        this.validateMulInput(point, scalar);
        if (this.randomBytes === void 0)
          throw new Error("randomBytes is required for scalar blinding");
        const bits = this.Point.Fn.BITS + BLIND_BITS;
        const blind = this.randomBytes(BLIND_BYTES);
        if (!isBytes2(blind) || blind.length !== BLIND_BYTES)
          throw new Error("randomBytes returned invalid byte array");
        blind[0] = blind[0] & 63 | 128;
        const n = scalar + bytesToNumberBE(blind) * this.Point.Fn.ORDER;
        return this.runCT(point, n, bits, transform);
      }
      /**
       * Constant-time multiplication `n*point` for an un-precomputed point, via a small fixed window.
       * A cached wNAF table only pays off when reused; a flat 2^FW_WINDOW table (`size-1` adds) is
       * far cheaper to build for a single use. The point-operation sequence is independent of `n`:
       * build the table, then per window exactly FW_WINDOW doublings, a data-oblivious scan over
       * every table entry, and one addition (adds the identity when the window digit is 0 — never
       * skipped).
       *
       * `n` must be `< 2^bits`. Assumes complete addition (adding the identity costs the same as any
       * add), which holds for the Weierstrass/Edwards point types used here. The table is left in
       * projective form (no normalizeZ): normalizing this small a table costs more than the
       * mixed-add savings it would buy for a single multiply.
       * @returns real point `p`; `f` duplicates it only to match {@link wnafCachedCT}'s return shape
       * (this path needs no fake accumulator — its op-count is already scalar-independent).
       */
      fixedWindowCT(point, n, bits) {
        const W = FW_WINDOW;
        const size = 1 << W;
        const mask = bitMask(W);
        const table = new Array(size);
        table[0] = this.ZERO;
        for (let i = 1; i < size; i++)
          table[i] = table[i - 1].add(point);
        const windows = Math.ceil(bits / W);
        let acc = this.ZERO;
        for (let window2 = windows - 1; window2 >= 0; window2--) {
          if (window2 !== windows - 1)
            for (let d = 0; d < W; d++)
              acc = acc.double();
          const digit = Number(n >> BigInt(window2 * W) & mask);
          let sel = table[0];
          for (let i = 1; i < size; i++)
            sel = i === digit ? table[i] : sel;
          acc = acc.add(sel);
        }
        return { p: acc, f: acc };
      }
      shouldBlind(point, cofactor) {
        if (this.randomBytes === void 0)
          return false;
        if (cofactor === _1n3)
          return true;
        if (point !== this.BASE)
          return false;
        if (this.baseCanBeBlinded === void 0)
          this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
        return this.baseCanBeBlinded;
      }
      mulSecret(point, scalar, cofactor, transform) {
        return this.shouldBlind(point, cofactor) ? this.mulCTBlinded(point, scalar, transform) : this.mulCT(point, scalar, transform);
      }
      mulUnsafe(point, scalar, transform) {
        this.assertPoint(point);
        if (!isPosBig(scalar))
          throw new Error("invalid scalar");
        const W = getWindowSize(point);
        if (W === 1 || scalar >= this.Point.Fn.ORDER)
          return mulAddUnsafe(this.Point, [point], [scalar], true);
        const precomputes = this.getWnafPrecomputes(W, point, this.bits, transform);
        return this.wnafCachedCT(precomputes, scalar).p;
      }
      // Remembers the window size used for precomputed wNAF multiplication of the given point
      // and drops any previously built tables. Usually only the base point is precomputed.
      // W=1 resets the point to the un-precomputed (table-less) paths.
      // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
      setWindowSize(point, W) {
        this.assertPoint(point);
        validateW(W, this.bits);
        const windows = Math.ceil((this.bits + BLIND_BITS) / W) + 1;
        validateTableBytes(windows * 2 ** (W - 1), this.Point.Fp.BYTES);
        pointWindowSizes.set(point, W);
        this.wnafPrecomputes.delete(point);
      }
      // True when a window size is set: tables themselves are built lazily on first multiply.
      hasWindowSize(point) {
        return getWindowSize(point) !== 1;
      }
    };
  }
});

// node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/hmac.js
var _HMAC, hmac;
var init_hmac = __esm({
  "node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/hmac.js"() {
    init_utils();
    _HMAC = class {
      oHash;
      iHash;
      blockLen;
      outputLen;
      canXOF = false;
      finished = false;
      destroyed = false;
      constructor(hash, key) {
        ahash(hash);
        abytes(key, void 0, "key");
        this.iHash = hash.create();
        if (typeof this.iHash.update !== "function")
          throw new Error("expected Hash instance");
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54;
        this.iHash.update(pad);
        this.oHash = hash.create();
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54 ^ 92;
        this.oHash.update(pad);
        clean(pad);
      }
      update(buf) {
        aexists(this);
        this.iHash.update(buf);
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const buf = out.subarray(0, this.outputLen);
        this.iHash.digestInto(buf);
        this.oHash.update(buf);
        this.oHash.digestInto(buf);
        this.destroy();
      }
      digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
      }
      _cloneInto(to) {
        to ||= Object.create(Object.getPrototypeOf(this), {});
        const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.canXOF = canXOF;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
      destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
      }
    };
    hmac = /* @__PURE__ */ (() => {
      const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
      hmac_.create = (hash, key) => new _HMAC(hash, key);
      return hmac_;
    })();
  }
});

// node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/der.js
var _0n4, DERErr, _DER, DER;
var init_der = __esm({
  "node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/der.js"() {
    init_utils2();
    _0n4 = /* @__PURE__ */ BigInt(0);
    DERErr = class extends Error {
      constructor(m = "") {
        super(m);
      }
    };
    _DER = {
      // asn.1 DER encoding utils
      Err: DERErr,
      // Basic building block is TLV (Tag-Length-Value)
      _tlv: {
        encode: (tag, data) => {
          const { Err: E } = _DER;
          asafenumber(tag, "tag");
          if (tag < 0 || tag > 255)
            throw new E("tlv.encode: wrong tag");
          astring(data, "data");
          if (data.length & 1)
            throw new E("tlv.encode: unpadded data");
          const dataLen = data.length / 2;
          const len = numberToHexUnpadded(dataLen);
          if (len.length / 2 & 128)
            throw new E("tlv.encode: long form length too big");
          const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
          const t = numberToHexUnpadded(tag);
          return t + lenLen + len + data;
        },
        // v - value, l - left bytes (unparsed)
        decode(tag, data) {
          const { Err: E } = _DER;
          data = abytes2(data, void 0, "DER data");
          let pos = 0;
          if (tag < 0 || tag > 255)
            throw new E("tlv.decode: wrong tag");
          if (data.length < 2 || data[pos++] !== tag)
            throw new E("tlv.decode: wrong tlv");
          const first = data[pos++];
          const isLong = !!(first & 128);
          let length = 0;
          if (!isLong)
            length = first;
          else {
            const lenLen = first & 127;
            if (!lenLen)
              throw new E("tlv.decode(long): indefinite length not supported");
            if (lenLen > 4)
              throw new E("tlv.decode(long): byte length is too big");
            const lengthBytes = data.subarray(pos, pos + lenLen);
            if (lengthBytes.length !== lenLen)
              throw new E("tlv.decode: length bytes not complete");
            if (lengthBytes[0] === 0)
              throw new E("tlv.decode(long): zero leftmost byte");
            for (const b of lengthBytes)
              length = length << 8 | b;
            pos += lenLen;
            if (length < 128)
              throw new E("tlv.decode(long): not minimal encoding");
          }
          const v = data.subarray(pos, pos + length);
          if (v.length !== length)
            throw new E("tlv.decode: wrong value length");
          return { v, l: data.subarray(pos + length) };
        }
      },
      // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
      // since we always use positive integers here. It must always be empty:
      // - add zero byte if exists
      // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
      _int: {
        encode(num) {
          const { Err: E } = _DER;
          abignumber(num);
          if (num < _0n4)
            throw new E("integer: negative integers are not allowed");
          let hex = numberToHexUnpadded(num);
          if (Number.parseInt(hex[0], 16) & 8)
            hex = "00" + hex;
          if (hex.length & 1)
            throw new E("unexpected DER parsing assertion: unpadded hex");
          return hex;
        },
        decode(data) {
          const { Err: E } = _DER;
          if (data.length < 1)
            throw new E("invalid signature integer: empty");
          if (data[0] & 128)
            throw new E("invalid signature integer: negative");
          if (data.length > 1 && data[0] === 0 && !(data[1] & 128))
            throw new E("invalid signature integer: unnecessary leading zero");
          return bytesToNumberBE(data);
        }
      },
      toSig(bytes) {
        const { Err: E, _int: int, _tlv: tlv } = _DER;
        const data = abytes2(bytes, void 0, "signature");
        const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
        if (seqLeftBytes.length)
          throw new E("invalid signature: left bytes after parsing");
        const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
        const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
        if (sLeftBytes.length)
          throw new E("invalid signature: left bytes after parsing");
        return { r: int.decode(rBytes), s: int.decode(sBytes) };
      },
      hexFromSig(sig) {
        const { _tlv: tlv, _int: int } = _DER;
        validateObject(sig, { r: "bigint", s: "bigint" }, {}, "sig");
        const rs = tlv.encode(2, int.encode(sig.r));
        const ss = tlv.encode(2, int.encode(sig.s));
        const seq = rs + ss;
        return tlv.encode(48, seq);
      }
    };
    DER = /* @__PURE__ */ (() => {
      Object.freeze(_DER._tlv);
      Object.freeze(_DER._int);
      return Object.freeze(_DER);
    })();
  }
});

// node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/weierstrass.js
function _splitEndoScalar(k2, basis, n) {
  aInRange("scalar", k2, _0n5, n);
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k2, n);
  const c2 = divNearest(-b1 * k2, n);
  let k1 = k2 - c1 * a1 - c2 * a2;
  let k22 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n5;
  const k2neg = k22 < _0n5;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k22 = -k22;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n5 || k1 >= MAX_NUM || k22 < _0n5 || k22 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed for k");
  }
  return { k1neg, k1, k2neg, k2: k22 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  validateObject(opts);
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  abool(optsn.lowS, "lowS");
  abool(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
function weierstrass(params, extraOpts = {}) {
  const validated = createCurveFields("weierstrass", params, extraOpts);
  const Fp = validated.Fp;
  const Fn3 = validated.Fn;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER2 } = CURVE;
  validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    randomBytes: "function"
  });
  const { endo, allowInfinityPoint } = extraOpts;
  const randomBytes3 = extraOpts.randomBytes === void 0 ? randomBytes2 : extraOpts.randomBytes;
  if (endo) {
    if (!Fp.is0(CURVE.a) || typeof endo.beta !== "bigint" || !Array.isArray(endo.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const lengths = getWLengths(Fp, Fn3);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes(_c, point, isCompressed) {
    if (allowInfinityPoint && point.is0())
      return Uint8Array.of(0);
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    abool(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes2(pprefix(hasEvenY), bx);
    } else {
      return concatBytes2(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    abytes2(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (allowInfinityPoint && length === 1 && head === 0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const evenY = Fp.isOdd(y);
      const evenH = (head & 1) === 1;
      if (evenH !== evenY)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = extraOpts.toBytes === void 0 ? pointToBytes : extraOpts.toBytes;
  const decodePoint = extraOpts.fromBytes === void 0 ? pointFromBytes : extraOpts.fromBytes;
  const b3 = Fp.mul(CURVE.b, _3n2);
  const mulA = Fp.is0(CURVE.a) ? (_) => Fp.ZERO : (x) => Fp.mul(CURVE.a, x);
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n3);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return n;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point2))
      throw new Error("Weierstrass Point expected");
  }
  function splitEndoScalarN(k2) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k2, endo.basises, Fn3.ORDER);
  }
  function pushWnafPair(points, scalars, p, k2) {
    if (!Fn3.isValid(k2))
      throw new RangeError("invalid scalar: out of range");
    if (endo) {
      const { k1neg, k1, k2neg, k2: k22 } = splitEndoScalarN(k2);
      const psi = new Point2(Fp.mul(p.X, endo.beta), p.Y, p.Z);
      points.push(k1neg ? p.negate() : p, k2neg ? psi.negate() : psi);
      scalars.push(k1, k22);
    } else {
      points.push(p);
      scalars.push(k2);
    }
  }
  const validityCache = /* @__PURE__ */ new WeakSet();
  class Point2 {
    static BASE = new Point2(CURVE.Gx, CURVE.Gy, Fp.ONE);
    static ZERO = new Point2(Fp.ZERO, Fp.ONE, Fp.ZERO);
    static Fp = Fp;
    static Fn = Fn3;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point2)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point2.ZERO;
      return new Point2(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point2.fromAffine(decodePoint(abytes2(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point2.fromBytes(hexToBytes2(hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     * @param isLazy - true will defer table computation until the first multiplication
     */
    precompute(windowSize = 6, isLazy = true) {
      wnaf.setWindowSize(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const p = this;
      if (p.is0()) {
        if (extraOpts.allowInfinityPoint && Fp.is0(p.X) && Fp.eql(p.Y, Fp.ONE) && Fp.is0(p.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      if (validityCache.has(p))
        return;
      const { x, y } = p.toAffine();
      if (!Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("bad point: x or y not field elements");
      if (!isValidXY(x, y))
        throw new Error("bad point: equation left != right");
      if (!p.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
      validityCache.add(p);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point2(this.X, Fp.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = mulA(Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = mulA(t2);
      t3 = Fp.sub(t0, t2);
      t3 = mulA(t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point2(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = mulA(t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = mulA(t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = mulA(t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point2(X3, Y3, Z3);
    }
    subtract(other) {
      aprjpoint(other);
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point2.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses precomputed tables (signed fixed-window wNAF) when available.
     * Uses scalar blinding and avoids endomorphism splitting in the secret-scalar path.
     * @param scalar - by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      if (!Fn3.isValidNot0(scalar))
        throw new RangeError("invalid scalar: out of range");
      const { p, f } = wnaf.mulSecret(this, scalar, cofactor, normalize);
      return normalize([p, f])[0];
    }
    /**
     * Non-constant-time multiplication. Uses width-4 wNAF with GLV endomorphism splitting
     * when available (two half-width scalars sharing one halved doubling chain).
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(scalar) {
      const p = this;
      const sc = scalar;
      if (!Fn3.isValid(sc))
        throw new RangeError("invalid scalar: out of range");
      if (sc === _0n5 || p.is0())
        return Point2.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasWindowSize(this))
        return wnaf.mulUnsafe(p, sc, normalize);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, p, sc);
      return mulAddUnsafe(Point2, points, scalars);
    }
    /**
     * Non-constant-time double-scalar multiplication `a⋅this + b⋅other` (Strauss–Shamir).
     * Both walks share one doubling chain via {@link mulAddUnsafe}, and GLV endomorphism
     * (when available) halves the chain again by splitting each scalar into two half-width
     * parts. Used by ECDSA verification and public-key recovery for `R = u1⋅G + u2⋅P`.
     * Only for public scalars.
     */
    mulAddUnsafe(a, other, b) {
      aprjpoint(other);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, this, a);
      pushWnafPair(points, scalars, other, b);
      return mulAddUnsafe(Point2, points, scalars);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      const p = this;
      let iz = invertedZ;
      if (iz != null && !Fp.isValid(iz))
        throw new RangeError('"invertedZ" expected valid field element');
      const { X, Y, Z } = p;
      if (Fp.eql(Z, Fp.ONE))
        return { x: X, y: Y };
      const is0 = p.is0();
      if (iz == null)
        iz = is0 ? Fp.ONE : Fp.inv(Z);
      const x = Fp.mul(X, iz);
      const y = Fp.mul(Y, iz);
      const zz = Fp.mul(Z, iz);
      if (is0)
        return { x: Fp.ZERO, y: Fp.ZERO };
      if (!Fp.eql(zz, Fp.ONE))
        throw new Error("invZ was invalid");
      return { x, y };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree } = extraOpts;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point2, this);
      return wnaf.mulUnsafe(this, CURVE_ORDER2).is0();
    }
    clearCofactor() {
      const { clearCofactor } = extraOpts;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point2, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      if (cofactor === _1n4)
        return this.is0();
      return this.clearCofactor().is0();
    }
    toBytes(isCompressed = true) {
      abool(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point2, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex2(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const normalize = (points) => normalizeZ(Point2, points);
  const wnaf = new ScalarMultiplier(Point2, randomBytes3);
  if (wnaf.bits >= 6)
    Point2.BASE.precompute(6);
  Object.freeze(Point2.prototype);
  Object.freeze(Point2);
  return Point2;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp, Fn3) {
  return {
    secretKey: Fn3.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    // Raw compact `(r || s)` signature width; DER and recovered signatures use
    // different lengths outside this helper.
    signature: 2 * Fn3.BYTES
  };
}
function ecdh(Point2, ecdhOpts = {}) {
  validatePointCons(Point2);
  const { Fn: Fn3 } = Point2;
  const randomBytes_ = ecdhOpts.randomBytes === void 0 ? randomBytes2 : ecdhOpts.randomBytes;
  const lengths = Object.assign(getWLengths(Point2.Fp, Fn3), {
    seed: Math.max(getMinHashLength(Fn3.ORDER), 16)
  });
  function isValidSecretKey(secretKey) {
    try {
      const num = Fn3.fromBytes(secretKey);
      return Fn3.isValidNot0(num);
    } catch (error) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !!Point2.fromBytes(publicKey);
    } catch (error) {
      return false;
    }
  }
  function randomSecretKey(seed) {
    seed = seed === void 0 ? randomBytes_(lengths.seed) : seed;
    return mapHashToField(abytes2(seed, lengths.seed, "seed"), Fn3.ORDER);
  }
  function getPublicKey2(secretKey, isCompressed = true) {
    return Point2.BASE.multiply(Fn3.fromBytes(secretKey)).toBytes(isCompressed);
  }
  function isProbPub(item) {
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    const allowedLengths = Fn3._lengths;
    if (!isBytes2(item))
      return void 0;
    const l = abytes2(item, void 0, "key").length;
    const isPub = l === publicKey || l === publicKeyUncompressed;
    const isSec = l === secretKey || !!allowedLengths?.includes(l);
    if (isPub && isSec)
      return void 0;
    return isPub;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = Fn3.fromBytes(secretKeyA);
    const b = Point2.fromBytes(publicKeyB);
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey
  };
  const keygen = createKeygen(randomSecretKey, getPublicKey2);
  Object.freeze(utils);
  Object.freeze(lengths);
  return Object.freeze({ getPublicKey: getPublicKey2, getSharedSecret, keygen, Point: Point2, utils, lengths });
}
function ecdsa(Point2, hash, ecdsaOpts = {}) {
  validatePointCons(Point2);
  const hash_ = hash;
  ahash(hash_);
  validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const opts = Object.assign({}, ecdsaOpts);
  const randomBytes3 = opts.randomBytes === void 0 ? randomBytes2 : opts.randomBytes;
  const hmac2 = opts.hmac === void 0 ? (key, msg) => hmac(hash_, key, msg) : opts.hmac;
  const { Fp, Fn: Fn3 } = Point2;
  const { ORDER: CURVE_ORDER2, BITS: fnBits } = Fn3;
  const blindLength = getMinHashLength(CURVE_ORDER2);
  const csprng = probeRandomBytes(randomBytes3, blindLength);
  const { keygen, getPublicKey: getPublicKey2, getSharedSecret, utils, lengths } = ecdh(Point2, opts);
  const defaultSigOpts = {
    prehash: true,
    lowS: typeof opts.lowS === "boolean" ? opts.lowS : true,
    format: "compact",
    extraEntropy: false
  };
  const hasLargeRecoveryLifts = CURVE_ORDER2 * _2n2 + _1n4 < Fp.ORDER;
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER2 >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num) {
    if (!Fn3.isValidNot0(num))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num;
  }
  function assertFieldSignIsSupported() {
    if (!Fp.isOdd)
      throw new Error("Field doesn't support isOdd");
  }
  function getRecoveryBit(x, y, r) {
    assertFieldSignIsSupported();
    return (x === r ? 0 : 2) | Number(Fp.isOdd(y));
  }
  function assertRecoverableCurve() {
    if (hasLargeRecoveryLifts)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return abytes2(bytes, sizer);
  }
  class Signature {
    r;
    s;
    recovery;
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null) {
        assertRecoverableCurve();
        if (![0, 1, 2, 3].includes(recovery))
          throw new Error("invalid recovery id");
        this.recovery = recovery;
      }
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts.format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        const { r: r2, s: s2 } = DER.toSig(abytes2(bytes));
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = lengths.signature / 2;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn3.fromBytes(r), Fn3.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes2(hex), format);
    }
    assertRecovery() {
      const { recovery } = this;
      if (recovery == null)
        throw new Error("invalid recovery id: must be present");
      return recovery;
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(messageHash) {
      const { r, s } = this;
      const recovery = this.assertRecovery();
      const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER2 : r;
      if (!Fp.isValid(radj))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const x = Fp.toBytes(radj);
      const R = Point2.fromBytes(concatBytes2(pprefix((recovery & 1) === 0), x));
      const ir = Fn3.inv(radj);
      const h = bits2int_modN(abytes2(messageHash, void 0, "msgHash"));
      const u1 = Fn3.create(-h * ir);
      const u2 = Fn3.create(s * ir);
      const Q = Point2.BASE.mulAddUnsafe(u1, R, u2);
      if (Q.is0())
        throw new Error("invalid recovery: point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts.format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes2(DER.hexFromSig(this));
      const { r, s } = this;
      const rb = Fn3.toBytes(r);
      const sb = Fn3.toBytes(s);
      if (format === "recovered") {
        assertRecoverableCurve();
        return concatBytes2(Uint8Array.of(this.assertRecovery()), rb, sb);
      }
      return concatBytes2(rb, sb);
    }
    toHex(format) {
      return bytesToHex2(this.toBytes(format));
    }
  }
  Object.freeze(Signature.prototype);
  Object.freeze(Signature);
  const bits2int = opts.bits2int === void 0 ? function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num >> BigInt(delta) : num;
  } : opts.bits2int;
  const bits2int_modN = opts.bits2int_modN === void 0 ? function bits2int_modN_def(bytes) {
    return Fn3.create(bits2int(bytes));
  } : opts.bits2int_modN;
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num) {
    aInRange("num < 2^" + fnBits, num, _0n5, ORDER_MASK);
    return Fn3.toBytes(num);
  }
  function validateMsgAndHash(message, prehash) {
    abytes2(message, void 0, "message");
    return prehash ? abytes2(hash_(message), void 0, "prehashed message") : message;
  }
  function prepSig(message, secretKey, opts2) {
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts2, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = Fn3.fromBytes(secretKey);
    if (!Fn3.isValidNot0(d))
      throw new Error("invalid private key");
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes3(lengths.secretKey) : extraEntropy;
      seedArgs.push(abytes2(e, void 0, "extraEntropy"));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k2 = bits2int(kBytes);
      if (!Fn3.isValidNot0(k2))
        return;
      const q = Point2.BASE.multiply(k2).toAffine();
      const r = Fn3.create(q.x);
      if (r === _0n5)
        return;
      let s;
      if (csprng !== void 0) {
        const b = bytesToNumberBE(mapHashToField(csprng(blindLength), CURVE_ORDER2));
        const ibk = Fn3.inv(Fn3.mul(b, k2));
        const bm = Fn3.mul(b, m);
        const bd = Fn3.mul(b, d);
        s = Fn3.create(ibk * Fn3.create(bm + bd * r));
      } else {
        const ik = invertCt(k2, CURVE_ORDER2);
        s = Fn3.create(ik * Fn3.create(m + r * d));
      }
      if (s === _0n5)
        return;
      let recovery = getRecoveryBit(q.x, q.y, r);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn3.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, hasLargeRecoveryLifts ? void 0 : recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts2 = {}) {
    const { seed, k2sig } = prepSig(message, secretKey, opts2);
    const drbg = createHmacDrbg(hash_.outputLen, Fn3.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig.toBytes(opts2.format);
  }
  function verify(signature, message, publicKey, opts2 = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts2, defaultSigOpts);
    publicKey = abytes2(publicKey, void 0, "publicKey");
    message = validateMsgAndHash(message, prehash);
    if (!isBytes2(signature)) {
      const end = signature instanceof Signature ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + end);
    }
    validateSigLength(signature, format);
    try {
      const sig = Signature.fromBytes(signature, format);
      const P = Point2.fromBytes(publicKey);
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn3.inv(s);
      const u1 = Fn3.create(h * is);
      const u2 = Fn3.create(r * is);
      const R = Point2.BASE.mulAddUnsafe(u1, P, u2);
      if (R.is0())
        return false;
      const q = R.toAffine();
      const v = Fn3.create(q.x);
      if (v !== r)
        return false;
      if (format === "recovered" && sig.recovery !== getRecoveryBit(q.x, q.y, r))
        return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts2 = {}) {
    const { prehash } = validateSigOpts(opts2, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey: getPublicKey2,
    getSharedSecret,
    utils,
    lengths,
    Point: Point2,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash: hash_
  });
}
var divNearest, _0n5, _1n4, _2n2, _3n2, _4n3;
var init_weierstrass = __esm({
  "node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/abstract/weierstrass.js"() {
    init_hmac();
    init_utils();
    init_utils2();
    init_curve();
    init_der();
    init_modular();
    divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n2) / den;
    _0n5 = /* @__PURE__ */ BigInt(0);
    _1n4 = /* @__PURE__ */ BigInt(1);
    _2n2 = /* @__PURE__ */ BigInt(2);
    _3n2 = /* @__PURE__ */ BigInt(3);
    _4n3 = /* @__PURE__ */ BigInt(4);
  }
});

// node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/secp256k1.js
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var secp256k1_CURVE, secp256k1_ENDO, _2n3, Fpk1, Pointk1, secp256k1;
var init_secp256k1 = __esm({
  "node_modules/.pnpm/@noble+curves@2.3.0/node_modules/@noble/curves/secp256k1.js"() {
    init_sha2();
    init_modular();
    init_weierstrass();
    secp256k1_CURVE = {
      p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
      n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
      h: BigInt(1),
      a: BigInt(0),
      b: BigInt(7),
      Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
      Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
    };
    secp256k1_ENDO = {
      beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
      basises: [
        [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
        [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
      ]
    };
    _2n3 = /* @__PURE__ */ BigInt(2);
    Fpk1 = /* @__PURE__ */ Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
    Pointk1 = /* @__PURE__ */ weierstrass(secp256k1_CURVE, {
      Fp: Fpk1,
      endo: secp256k1_ENDO
    });
    secp256k1 = /* @__PURE__ */ ecdsa(Pointk1, sha256);
  }
});

// node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/pbkdf2.js
function pbkdf2Init(hash, _password, _salt, _opts) {
  ahash(hash);
  const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
  const { c, dkLen, asyncTick } = opts;
  anumber(c, "c");
  anumber(dkLen, "dkLen");
  anumber(asyncTick, "asyncTick");
  if (c < 1)
    throw new Error('"c" (iterations) must be >= 1');
  if (dkLen < 1)
    throw new Error('"dkLen" must be >= 1');
  if (dkLen > (2 ** 32 - 1) * hash.outputLen)
    throw new Error("derived key too long");
  const p = kdfInputToBytes(_password, "password");
  const s = kdfInputToBytes(_salt, "salt");
  const DK = new Uint8Array(dkLen);
  const { iHash, oHash, outputLen } = hmac.create(hash, p);
  const u = new Uint8Array(outputLen);
  const eng = pbkdf2Engine(iHash, oHash, s, u);
  return { c, dkLen, asyncTick, DK, outputLen, eng };
}
function pbkdf2Engine(iHash, oHash, salt, u) {
  const counter = new Uint8Array(4);
  const view = createView(counter);
  const salted = iHash._cloneInto().update(salt);
  const work = oHash._cloneInto();
  const iClone = iHash._cloneInto;
  const oClone = oHash._cloneInto;
  return {
    u1: (ti, Ti) => {
      view.setInt32(0, ti, false);
      salted._cloneInto(work).update(counter).digestInto(u);
      oHash._cloneInto(work).update(u).digestInto(u);
      Ti.set(u.subarray(0, Ti.length));
    },
    // Whole `F` inner loop for the sync variant: one optimized function owns the hot loop.
    rounds: (c, Ti) => {
      for (let ui = 1; ui < c; ui++) {
        iClone.call(iHash, work).update(u).digestInto(u);
        oClone.call(oHash, work).update(u).digestInto(u);
        for (let i = 0; i < Ti.length; i++)
          Ti[i] ^= u[i];
      }
    },
    output: (DK) => {
      iHash.destroy();
      oHash.destroy();
      salted.destroy();
      work.destroy();
      clean(u);
      return DK;
    }
  };
}
function pbkdf2(hash, password, salt, opts) {
  const { c, dkLen, DK, outputLen, eng } = pbkdf2Init(hash, password, salt, opts);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += outputLen) {
    const Ti = DK.subarray(pos, pos + outputLen);
    eng.u1(ti, Ti);
    eng.rounds(c, Ti);
  }
  return eng.output(DK);
}
var init_pbkdf2 = __esm({
  "node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/pbkdf2.js"() {
    init_hmac();
    init_utils();
  }
});

// src/lib/util/base64.ts
function toBase64url(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64url(base64url2) {
  let base64 = base64url2.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return base64;
}
var base64url;
var init_base64 = __esm({
  "src/lib/util/base64.ts"() {
    base64url = {
      encode(data) {
        let binary = "";
        for (let i = 0; i < data.length; i++) {
          binary += String.fromCharCode(data[i]);
        }
        const base64 = btoa(binary);
        return toBase64url(base64);
      },
      decode(encoded) {
        const base64 = fromBase64url(encoded);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }
    };
  }
});

// src/lib/wallet/wordlist.ts
var WORDLIST, LEGACY_WORDLIST;
var init_wordlist = __esm({
  "src/lib/wallet/wordlist.ts"() {
    WORDLIST = [
      "abandon",
      "ability",
      "able",
      "about",
      "above",
      "absent",
      "absorb",
      "abstract",
      "absurd",
      "abuse",
      "access",
      "accident",
      "account",
      "accuse",
      "achieve",
      "acid",
      "acoustic",
      "acquire",
      "across",
      "act",
      "action",
      "actor",
      "actress",
      "actual",
      "adapt",
      "add",
      "addict",
      "address",
      "adjust",
      "admit",
      "adult",
      "advance",
      "advice",
      "aerobic",
      "affair",
      "afford",
      "afraid",
      "again",
      "age",
      "agent",
      "agree",
      "ahead",
      "aim",
      "air",
      "airport",
      "aisle",
      "alarm",
      "album",
      "alcohol",
      "alert",
      "alien",
      "all",
      "alley",
      "allow",
      "almost",
      "alone",
      "alpha",
      "already",
      "also",
      "alter",
      "always",
      "amateur",
      "amazing",
      "among",
      "amount",
      "amused",
      "analyst",
      "anchor",
      "ancient",
      "anger",
      "angle",
      "angry",
      "animal",
      "ankle",
      "announce",
      "annual",
      "another",
      "answer",
      "antenna",
      "antique",
      "anxiety",
      "any",
      "apart",
      "apology",
      "appear",
      "apple",
      "approve",
      "april",
      "arch",
      "arctic",
      "area",
      "arena",
      "argue",
      "arm",
      "armed",
      "armor",
      "army",
      "around",
      "arrange",
      "arrest",
      "arrive",
      "arrow",
      "art",
      "artefact",
      "artist",
      "artwork",
      "ask",
      "aspect",
      "assault",
      "asset",
      "assist",
      "assume",
      "asthma",
      "athlete",
      "atom",
      "attack",
      "attend",
      "attitude",
      "attract",
      "auction",
      "audit",
      "august",
      "aunt",
      "author",
      "auto",
      "autumn",
      "average",
      "avocado",
      "avoid",
      "awake",
      "aware",
      "away",
      "awesome",
      "awful",
      "awkward",
      "axis",
      "baby",
      "bachelor",
      "bacon",
      "badge",
      "bag",
      "balance",
      "balcony",
      "ball",
      "bamboo",
      "banana",
      "banner",
      "bar",
      "barely",
      "bargain",
      "barrel",
      "base",
      "basic",
      "basket",
      "battle",
      "beach",
      "bean",
      "beauty",
      "because",
      "become",
      "beef",
      "before",
      "begin",
      "behave",
      "behind",
      "believe",
      "below",
      "belt",
      "bench",
      "benefit",
      "best",
      "betray",
      "better",
      "between",
      "beyond",
      "bicycle",
      "bid",
      "bike",
      "bind",
      "biology",
      "bird",
      "birth",
      "bitter",
      "black",
      "blade",
      "blame",
      "blanket",
      "blast",
      "bleak",
      "bless",
      "blind",
      "blood",
      "blossom",
      "blouse",
      "blue",
      "blur",
      "blush",
      "board",
      "boat",
      "body",
      "boil",
      "bomb",
      "bone",
      "bonus",
      "book",
      "boost",
      "border",
      "boring",
      "borrow",
      "boss",
      "bottom",
      "bounce",
      "box",
      "boy",
      "bracket",
      "brain",
      "brand",
      "brass",
      "brave",
      "bread",
      "breeze",
      "brick",
      "bridge",
      "brief",
      "bright",
      "bring",
      "brisk",
      "broccoli",
      "broken",
      "bronze",
      "broom",
      "brother",
      "brown",
      "brush",
      "bubble",
      "buddy",
      "budget",
      "buffalo",
      "build",
      "bulb",
      "bulk",
      "bullet",
      "bundle",
      "bunker",
      "burden",
      "burger",
      "burst",
      "bus",
      "business",
      "busy",
      "butter",
      "buyer",
      "buzz",
      "cabbage",
      "cabin",
      "cable",
      "cactus",
      "cage",
      "cake",
      "call",
      "calm",
      "camera",
      "camp",
      "can",
      "canal",
      "cancel",
      "candy",
      "cannon",
      "canoe",
      "canvas",
      "canyon",
      "capable",
      "capital",
      "captain",
      "car",
      "carbon",
      "card",
      "cargo",
      "carpet",
      "carry",
      "cart",
      "case",
      "cash",
      "casino",
      "castle",
      "casual",
      "cat",
      "catalog",
      "catch",
      "category",
      "cattle",
      "caught",
      "cause",
      "caution",
      "cave",
      "ceiling",
      "celery",
      "cement",
      "census",
      "century",
      "cereal",
      "certain",
      "chair",
      "chalk",
      "champion",
      "change",
      "chaos",
      "chapter",
      "charge",
      "chase",
      "chat",
      "cheap",
      "check",
      "cheese",
      "chef",
      "cherry",
      "chest",
      "chicken",
      "chief",
      "child",
      "chimney",
      "choice",
      "choose",
      "chronic",
      "chuckle",
      "chunk",
      "churn",
      "cigar",
      "cinnamon",
      "circle",
      "citizen",
      "city",
      "civil",
      "claim",
      "clap",
      "clarify",
      "claw",
      "clay",
      "clean",
      "clerk",
      "clever",
      "click",
      "client",
      "cliff",
      "climb",
      "clinic",
      "clip",
      "clock",
      "clog",
      "close",
      "cloth",
      "cloud",
      "clown",
      "club",
      "clump",
      "cluster",
      "clutch",
      "coach",
      "coast",
      "coconut",
      "code",
      "coffee",
      "coil",
      "coin",
      "collect",
      "color",
      "column",
      "combine",
      "come",
      "comfort",
      "comic",
      "common",
      "company",
      "concert",
      "conduct",
      "confirm",
      "congress",
      "connect",
      "consider",
      "control",
      "convince",
      "cook",
      "cool",
      "copper",
      "copy",
      "coral",
      "core",
      "corn",
      "correct",
      "cost",
      "cotton",
      "couch",
      "country",
      "couple",
      "course",
      "cousin",
      "cover",
      "coyote",
      "crack",
      "cradle",
      "craft",
      "cram",
      "crane",
      "crash",
      "crater",
      "crawl",
      "crazy",
      "cream",
      "credit",
      "creek",
      "crew",
      "cricket",
      "crime",
      "crisp",
      "critic",
      "crop",
      "cross",
      "crouch",
      "crowd",
      "crucial",
      "cruel",
      "cruise",
      "crumble",
      "crunch",
      "crush",
      "cry",
      "crystal",
      "cube",
      "culture",
      "cup",
      "cupboard",
      "curious",
      "current",
      "curtain",
      "curve",
      "cushion",
      "custom",
      "cute",
      "cycle",
      "dad",
      "damage",
      "damp",
      "dance",
      "danger",
      "daring",
      "dash",
      "daughter",
      "dawn",
      "day",
      "deal",
      "debate",
      "debris",
      "decade",
      "december",
      "decide",
      "decline",
      "decorate",
      "decrease",
      "deer",
      "defense",
      "define",
      "defy",
      "degree",
      "delay",
      "deliver",
      "demand",
      "demise",
      "denial",
      "dentist",
      "deny",
      "depart",
      "depend",
      "deposit",
      "depth",
      "deputy",
      "derive",
      "describe",
      "desert",
      "design",
      "desk",
      "despair",
      "destroy",
      "detail",
      "detect",
      "develop",
      "device",
      "devote",
      "diagram",
      "dial",
      "diamond",
      "diary",
      "dice",
      "diesel",
      "diet",
      "differ",
      "digital",
      "dignity",
      "dilemma",
      "dinner",
      "dinosaur",
      "direct",
      "dirt",
      "disagree",
      "discover",
      "disease",
      "dish",
      "dismiss",
      "disorder",
      "display",
      "distance",
      "divert",
      "divide",
      "divorce",
      "dizzy",
      "doctor",
      "document",
      "dog",
      "doll",
      "dolphin",
      "domain",
      "donate",
      "donkey",
      "donor",
      "door",
      "dose",
      "double",
      "dove",
      "draft",
      "dragon",
      "drama",
      "drastic",
      "draw",
      "dream",
      "dress",
      "drift",
      "drill",
      "drink",
      "drip",
      "drive",
      "drop",
      "drum",
      "dry",
      "duck",
      "dumb",
      "dune",
      "during",
      "dust",
      "dutch",
      "duty",
      "dwarf",
      "dynamic",
      "eager",
      "eagle",
      "early",
      "earn",
      "earth",
      "easily",
      "east",
      "easy",
      "echo",
      "ecology",
      "economy",
      "edge",
      "edit",
      "educate",
      "effort",
      "egg",
      "eight",
      "either",
      "elbow",
      "elder",
      "electric",
      "elegant",
      "element",
      "elephant",
      "elevator",
      "elite",
      "else",
      "embark",
      "embody",
      "embrace",
      "emerge",
      "emotion",
      "employ",
      "empower",
      "empty",
      "enable",
      "enact",
      "end",
      "endless",
      "endorse",
      "enemy",
      "energy",
      "enforce",
      "engage",
      "engine",
      "enhance",
      "enjoy",
      "enlist",
      "enough",
      "enrich",
      "enroll",
      "ensure",
      "enter",
      "entire",
      "entry",
      "envelope",
      "episode",
      "equal",
      "equip",
      "era",
      "erase",
      "erode",
      "erosion",
      "error",
      "erupt",
      "escape",
      "essay",
      "essence",
      "estate",
      "eternal",
      "ethics",
      "evidence",
      "evil",
      "evoke",
      "evolve",
      "exact",
      "example",
      "excess",
      "exchange",
      "excite",
      "exclude",
      "excuse",
      "execute",
      "exercise",
      "exhaust",
      "exhibit",
      "exile",
      "exist",
      "exit",
      "exotic",
      "expand",
      "expect",
      "expire",
      "explain",
      "expose",
      "express",
      "extend",
      "extra",
      "eye",
      "eyebrow",
      "fabric",
      "face",
      "faculty",
      "fade",
      "faint",
      "faith",
      "fall",
      "false",
      "fame",
      "family",
      "famous",
      "fan",
      "fancy",
      "fantasy",
      "farm",
      "fashion",
      "fat",
      "fatal",
      "father",
      "fatigue",
      "fault",
      "favorite",
      "feature",
      "february",
      "federal",
      "fee",
      "feed",
      "feel",
      "female",
      "fence",
      "festival",
      "fetch",
      "fever",
      "few",
      "fiber",
      "fiction",
      "field",
      "figure",
      "file",
      "film",
      "filter",
      "final",
      "find",
      "fine",
      "finger",
      "finish",
      "fire",
      "firm",
      "first",
      "fiscal",
      "fish",
      "fit",
      "fitness",
      "fix",
      "flag",
      "flame",
      "flash",
      "flat",
      "flavor",
      "flee",
      "flight",
      "flip",
      "float",
      "flock",
      "floor",
      "flower",
      "fluid",
      "flush",
      "fly",
      "foam",
      "focus",
      "fog",
      "foil",
      "fold",
      "follow",
      "food",
      "foot",
      "force",
      "forest",
      "forget",
      "fork",
      "fortune",
      "forum",
      "forward",
      "fossil",
      "foster",
      "found",
      "fox",
      "fragile",
      "frame",
      "frequent",
      "fresh",
      "friend",
      "fringe",
      "frog",
      "front",
      "frost",
      "frown",
      "frozen",
      "fruit",
      "fuel",
      "fun",
      "funny",
      "furnace",
      "fury",
      "future",
      "gadget",
      "gain",
      "galaxy",
      "gallery",
      "game",
      "gap",
      "garage",
      "garbage",
      "garden",
      "garlic",
      "garment",
      "gas",
      "gasp",
      "gate",
      "gather",
      "gauge",
      "gaze",
      "general",
      "genius",
      "genre",
      "gentle",
      "genuine",
      "gesture",
      "ghost",
      "giant",
      "gift",
      "giggle",
      "ginger",
      "giraffe",
      "girl",
      "give",
      "glad",
      "glance",
      "glare",
      "glass",
      "glide",
      "glimpse",
      "globe",
      "gloom",
      "glory",
      "glove",
      "glow",
      "glue",
      "goat",
      "goddess",
      "gold",
      "good",
      "goose",
      "gorilla",
      "gospel",
      "gossip",
      "govern",
      "gown",
      "grab",
      "grace",
      "grain",
      "grant",
      "grape",
      "grass",
      "gravity",
      "great",
      "green",
      "grid",
      "grief",
      "grit",
      "grocery",
      "group",
      "grow",
      "grunt",
      "guard",
      "guess",
      "guide",
      "guilt",
      "guitar",
      "gun",
      "gym",
      "habit",
      "hair",
      "half",
      "hammer",
      "hamster",
      "hand",
      "happy",
      "harbor",
      "hard",
      "harsh",
      "harvest",
      "hat",
      "have",
      "hawk",
      "hazard",
      "head",
      "health",
      "heart",
      "heavy",
      "hedgehog",
      "height",
      "hello",
      "helmet",
      "help",
      "hen",
      "hero",
      "hidden",
      "high",
      "hill",
      "hint",
      "hip",
      "hire",
      "history",
      "hobby",
      "hockey",
      "hold",
      "hole",
      "holiday",
      "hollow",
      "home",
      "honey",
      "hood",
      "hope",
      "horn",
      "horror",
      "horse",
      "hospital",
      "host",
      "hotel",
      "hour",
      "hover",
      "hub",
      "huge",
      "human",
      "humble",
      "humor",
      "hundred",
      "hungry",
      "hunt",
      "hurdle",
      "hurry",
      "hurt",
      "husband",
      "hybrid",
      "ice",
      "icon",
      "idea",
      "identify",
      "idle",
      "ignore",
      "ill",
      "illegal",
      "illness",
      "image",
      "imitate",
      "immense",
      "immune",
      "impact",
      "impose",
      "improve",
      "impulse",
      "inch",
      "include",
      "income",
      "increase",
      "index",
      "indicate",
      "indoor",
      "industry",
      "infant",
      "inflict",
      "inform",
      "inhale",
      "inherit",
      "initial",
      "inject",
      "injury",
      "inmate",
      "inner",
      "innocent",
      "input",
      "inquiry",
      "insane",
      "insect",
      "inside",
      "inspire",
      "install",
      "intact",
      "interest",
      "into",
      "invest",
      "invite",
      "involve",
      "iron",
      "island",
      "isolate",
      "issue",
      "item",
      "ivory",
      "jacket",
      "jaguar",
      "jar",
      "jazz",
      "jealous",
      "jeans",
      "jelly",
      "jewel",
      "job",
      "join",
      "joke",
      "journey",
      "joy",
      "judge",
      "juice",
      "jump",
      "jungle",
      "junior",
      "junk",
      "just",
      "kangaroo",
      "keen",
      "keep",
      "ketchup",
      "key",
      "kick",
      "kid",
      "kidney",
      "kind",
      "kingdom",
      "kiss",
      "kit",
      "kitchen",
      "kite",
      "kitten",
      "kiwi",
      "knee",
      "knife",
      "knock",
      "know",
      "lab",
      "label",
      "labor",
      "ladder",
      "lady",
      "lake",
      "lamp",
      "language",
      "laptop",
      "large",
      "later",
      "latin",
      "laugh",
      "laundry",
      "lava",
      "law",
      "lawn",
      "lawsuit",
      "layer",
      "lazy",
      "leader",
      "leaf",
      "learn",
      "leave",
      "lecture",
      "left",
      "leg",
      "legal",
      "legend",
      "leisure",
      "lemon",
      "lend",
      "length",
      "lens",
      "leopard",
      "lesson",
      "letter",
      "level",
      "liar",
      "liberty",
      "library",
      "license",
      "life",
      "lift",
      "light",
      "like",
      "limb",
      "limit",
      "link",
      "lion",
      "liquid",
      "list",
      "little",
      "live",
      "lizard",
      "load",
      "loan",
      "lobster",
      "local",
      "lock",
      "logic",
      "lonely",
      "long",
      "loop",
      "lottery",
      "loud",
      "lounge",
      "love",
      "loyal",
      "lucky",
      "luggage",
      "lumber",
      "lunar",
      "lunch",
      "luxury",
      "lyrics",
      "machine",
      "mad",
      "magic",
      "magnet",
      "maid",
      "mail",
      "main",
      "major",
      "make",
      "mammal",
      "man",
      "manage",
      "mandate",
      "mango",
      "mansion",
      "manual",
      "maple",
      "marble",
      "march",
      "margin",
      "marine",
      "market",
      "marriage",
      "mask",
      "mass",
      "master",
      "match",
      "material",
      "math",
      "matrix",
      "matter",
      "maximum",
      "maze",
      "meadow",
      "mean",
      "measure",
      "meat",
      "mechanic",
      "medal",
      "media",
      "melody",
      "melt",
      "member",
      "memory",
      "mention",
      "menu",
      "mercy",
      "merge",
      "merit",
      "merry",
      "mesh",
      "message",
      "metal",
      "method",
      "middle",
      "midnight",
      "milk",
      "million",
      "mimic",
      "mind",
      "minimum",
      "minor",
      "minute",
      "miracle",
      "mirror",
      "misery",
      "miss",
      "mistake",
      "mix",
      "mixed",
      "mixture",
      "mobile",
      "model",
      "modify",
      "mom",
      "moment",
      "monitor",
      "monkey",
      "monster",
      "month",
      "moon",
      "moral",
      "more",
      "morning",
      "mosquito",
      "mother",
      "motion",
      "motor",
      "mountain",
      "mouse",
      "move",
      "movie",
      "much",
      "muffin",
      "mule",
      "multiply",
      "muscle",
      "museum",
      "mushroom",
      "music",
      "must",
      "mutual",
      "myself",
      "mystery",
      "myth",
      "naive",
      "name",
      "napkin",
      "narrow",
      "nasty",
      "nation",
      "nature",
      "near",
      "neck",
      "need",
      "negative",
      "neglect",
      "neither",
      "nephew",
      "nerve",
      "nest",
      "net",
      "network",
      "neutral",
      "never",
      "news",
      "next",
      "nice",
      "night",
      "noble",
      "noise",
      "nominee",
      "noodle",
      "normal",
      "north",
      "nose",
      "notable",
      "note",
      "nothing",
      "notice",
      "novel",
      "now",
      "nuclear",
      "number",
      "nurse",
      "nut",
      "oak",
      "obey",
      "object",
      "oblige",
      "obscure",
      "observe",
      "obtain",
      "obvious",
      "occur",
      "ocean",
      "october",
      "odor",
      "off",
      "offer",
      "office",
      "often",
      "oil",
      "okay",
      "old",
      "olive",
      "olympic",
      "omit",
      "once",
      "one",
      "onion",
      "online",
      "only",
      "open",
      "opera",
      "opinion",
      "oppose",
      "option",
      "orange",
      "orbit",
      "orchard",
      "order",
      "ordinary",
      "organ",
      "orient",
      "original",
      "orphan",
      "ostrich",
      "other",
      "outdoor",
      "outer",
      "output",
      "outside",
      "oval",
      "oven",
      "over",
      "own",
      "owner",
      "oxygen",
      "oyster",
      "ozone",
      "pact",
      "paddle",
      "page",
      "pair",
      "palace",
      "palm",
      "panda",
      "panel",
      "panic",
      "panther",
      "paper",
      "parade",
      "parent",
      "park",
      "parrot",
      "party",
      "pass",
      "patch",
      "path",
      "patient",
      "patrol",
      "pattern",
      "pause",
      "pave",
      "payment",
      "peace",
      "peanut",
      "pear",
      "peasant",
      "pelican",
      "pen",
      "penalty",
      "pencil",
      "people",
      "pepper",
      "perfect",
      "permit",
      "person",
      "pet",
      "phone",
      "photo",
      "phrase",
      "physical",
      "piano",
      "picnic",
      "picture",
      "piece",
      "pig",
      "pigeon",
      "pill",
      "pilot",
      "pink",
      "pioneer",
      "pipe",
      "pistol",
      "pitch",
      "pizza",
      "place",
      "planet",
      "plastic",
      "plate",
      "play",
      "please",
      "pledge",
      "pluck",
      "plug",
      "plunge",
      "poem",
      "poet",
      "point",
      "polar",
      "pole",
      "police",
      "pond",
      "pony",
      "pool",
      "popular",
      "portion",
      "position",
      "possible",
      "post",
      "potato",
      "pottery",
      "poverty",
      "powder",
      "power",
      "practice",
      "praise",
      "predict",
      "prefer",
      "prepare",
      "present",
      "pretty",
      "prevent",
      "price",
      "pride",
      "primary",
      "print",
      "priority",
      "prison",
      "private",
      "prize",
      "problem",
      "process",
      "produce",
      "profit",
      "program",
      "project",
      "promote",
      "proof",
      "property",
      "prosper",
      "protect",
      "proud",
      "provide",
      "public",
      "pudding",
      "pull",
      "pulp",
      "pulse",
      "pumpkin",
      "punch",
      "pupil",
      "puppy",
      "purchase",
      "purity",
      "purpose",
      "purse",
      "push",
      "put",
      "puzzle",
      "pyramid",
      "quality",
      "quantum",
      "quarter",
      "question",
      "quick",
      "quit",
      "quiz",
      "quote",
      "rabbit",
      "raccoon",
      "race",
      "rack",
      "radar",
      "radio",
      "rail",
      "rain",
      "raise",
      "rally",
      "ramp",
      "ranch",
      "random",
      "range",
      "rapid",
      "rare",
      "rate",
      "rather",
      "raven",
      "raw",
      "razor",
      "ready",
      "real",
      "reason",
      "rebel",
      "rebuild",
      "recall",
      "receive",
      "recipe",
      "record",
      "recycle",
      "reduce",
      "reflect",
      "reform",
      "refuse",
      "region",
      "regret",
      "regular",
      "reject",
      "relax",
      "release",
      "relief",
      "rely",
      "remain",
      "remember",
      "remind",
      "remove",
      "render",
      "renew",
      "rent",
      "reopen",
      "repair",
      "repeat",
      "replace",
      "report",
      "require",
      "rescue",
      "resemble",
      "resist",
      "resource",
      "response",
      "result",
      "retire",
      "retreat",
      "return",
      "reunion",
      "reveal",
      "review",
      "reward",
      "rhythm",
      "rib",
      "ribbon",
      "rice",
      "rich",
      "ride",
      "ridge",
      "rifle",
      "right",
      "rigid",
      "ring",
      "riot",
      "ripple",
      "risk",
      "ritual",
      "rival",
      "river",
      "road",
      "roast",
      "robot",
      "robust",
      "rocket",
      "romance",
      "roof",
      "rookie",
      "room",
      "rose",
      "rotate",
      "rough",
      "round",
      "route",
      "royal",
      "rubber",
      "rude",
      "rug",
      "rule",
      "run",
      "runway",
      "rural",
      "sad",
      "saddle",
      "sadness",
      "safe",
      "sail",
      "salad",
      "salmon",
      "salon",
      "salt",
      "salute",
      "same",
      "sample",
      "sand",
      "satisfy",
      "satoshi",
      "sauce",
      "sausage",
      "save",
      "say",
      "scale",
      "scan",
      "scare",
      "scatter",
      "scene",
      "scheme",
      "school",
      "science",
      "scissors",
      "scorpion",
      "scout",
      "scrap",
      "screen",
      "script",
      "scrub",
      "sea",
      "search",
      "season",
      "seat",
      "second",
      "secret",
      "section",
      "security",
      "seed",
      "seek",
      "segment",
      "select",
      "sell",
      "seminar",
      "senior",
      "sense",
      "sentence",
      "series",
      "service",
      "session",
      "settle",
      "setup",
      "seven",
      "shadow",
      "shaft",
      "shallow",
      "share",
      "shed",
      "shell",
      "sheriff",
      "shield",
      "shift",
      "shine",
      "ship",
      "shiver",
      "shock",
      "shoe",
      "shoot",
      "shop",
      "short",
      "shoulder",
      "shove",
      "shrimp",
      "shrug",
      "shuffle",
      "shy",
      "sibling",
      "sick",
      "side",
      "siege",
      "sight",
      "sign",
      "silent",
      "silk",
      "silly",
      "silver",
      "similar",
      "simple",
      "since",
      "sing",
      "siren",
      "sister",
      "situate",
      "six",
      "size",
      "skate",
      "sketch",
      "ski",
      "skill",
      "skin",
      "skirt",
      "skull",
      "slab",
      "slam",
      "sleep",
      "slender",
      "slice",
      "slide",
      "slight",
      "slim",
      "slogan",
      "slot",
      "slow",
      "slush",
      "small",
      "smart",
      "smile",
      "smoke",
      "smooth",
      "snack",
      "snake",
      "snap",
      "sniff",
      "snow",
      "soap",
      "soccer",
      "social",
      "sock",
      "soda",
      "soft",
      "solar",
      "soldier",
      "solid",
      "solution",
      "solve",
      "someone",
      "song",
      "soon",
      "sorry",
      "sort",
      "soul",
      "sound",
      "soup",
      "source",
      "south",
      "space",
      "spare",
      "spatial",
      "spawn",
      "speak",
      "special",
      "speed",
      "spell",
      "spend",
      "sphere",
      "spice",
      "spider",
      "spike",
      "spin",
      "spirit",
      "split",
      "spoil",
      "sponsor",
      "spoon",
      "sport",
      "spot",
      "spray",
      "spread",
      "spring",
      "spy",
      "square",
      "squeeze",
      "squirrel",
      "stable",
      "stadium",
      "staff",
      "stage",
      "stairs",
      "stamp",
      "stand",
      "start",
      "state",
      "stay",
      "steak",
      "steel",
      "stem",
      "step",
      "stereo",
      "stick",
      "still",
      "sting",
      "stock",
      "stomach",
      "stone",
      "stool",
      "story",
      "stove",
      "strategy",
      "street",
      "strike",
      "strong",
      "struggle",
      "student",
      "stuff",
      "stumble",
      "style",
      "subject",
      "submit",
      "subway",
      "success",
      "such",
      "sudden",
      "suffer",
      "sugar",
      "suggest",
      "suit",
      "summer",
      "sun",
      "sunny",
      "sunset",
      "super",
      "supply",
      "supreme",
      "sure",
      "surface",
      "surge",
      "surprise",
      "surround",
      "survey",
      "suspect",
      "sustain",
      "swallow",
      "swamp",
      "swap",
      "swarm",
      "swear",
      "sweet",
      "swift",
      "swim",
      "swing",
      "switch",
      "sword",
      "symbol",
      "symptom",
      "syrup",
      "system",
      "table",
      "tackle",
      "tag",
      "tail",
      "talent",
      "talk",
      "tank",
      "tape",
      "target",
      "task",
      "taste",
      "tattoo",
      "taxi",
      "teach",
      "team",
      "tell",
      "ten",
      "tenant",
      "tennis",
      "tent",
      "term",
      "test",
      "text",
      "thank",
      "that",
      "theme",
      "then",
      "theory",
      "there",
      "they",
      "thing",
      "this",
      "thought",
      "three",
      "thrive",
      "throw",
      "thumb",
      "thunder",
      "ticket",
      "tide",
      "tiger",
      "tilt",
      "timber",
      "time",
      "tiny",
      "tip",
      "tired",
      "tissue",
      "title",
      "toast",
      "tobacco",
      "today",
      "toddler",
      "toe",
      "together",
      "toilet",
      "token",
      "tomato",
      "tomorrow",
      "tone",
      "tongue",
      "tonight",
      "tool",
      "tooth",
      "top",
      "topic",
      "topple",
      "torch",
      "tornado",
      "tortoise",
      "toss",
      "total",
      "tourist",
      "toward",
      "tower",
      "town",
      "toy",
      "track",
      "trade",
      "traffic",
      "tragic",
      "train",
      "transfer",
      "trap",
      "trash",
      "travel",
      "tray",
      "treat",
      "tree",
      "trend",
      "trial",
      "tribe",
      "trick",
      "trigger",
      "trim",
      "trip",
      "trophy",
      "trouble",
      "truck",
      "true",
      "truly",
      "trumpet",
      "trust",
      "truth",
      "try",
      "tube",
      "tuition",
      "tumble",
      "tuna",
      "tunnel",
      "turkey",
      "turn",
      "turtle",
      "twelve",
      "twenty",
      "twice",
      "twin",
      "twist",
      "two",
      "type",
      "typical",
      "ugly",
      "umbrella",
      "unable",
      "unaware",
      "uncle",
      "uncover",
      "under",
      "undo",
      "unfair",
      "unfold",
      "unhappy",
      "uniform",
      "unique",
      "unit",
      "universe",
      "unknown",
      "unlock",
      "until",
      "unusual",
      "unveil",
      "update",
      "upgrade",
      "uphold",
      "upon",
      "upper",
      "upset",
      "urban",
      "urge",
      "usage",
      "use",
      "used",
      "useful",
      "useless",
      "usual",
      "utility",
      "vacant",
      "vacuum",
      "vague",
      "valid",
      "valley",
      "valve",
      "van",
      "vanish",
      "vapor",
      "various",
      "vast",
      "vault",
      "vehicle",
      "velvet",
      "vendor",
      "venture",
      "venue",
      "verb",
      "verify",
      "version",
      "very",
      "vessel",
      "veteran",
      "viable",
      "vibrant",
      "vicious",
      "victory",
      "video",
      "view",
      "village",
      "vintage",
      "violin",
      "virtual",
      "virus",
      "visa",
      "visit",
      "visual",
      "vital",
      "vivid",
      "vocal",
      "voice",
      "void",
      "volcano",
      "volume",
      "vote",
      "voyage",
      "wage",
      "wagon",
      "wait",
      "walk",
      "wall",
      "walnut",
      "want",
      "warfare",
      "warm",
      "warrior",
      "wash",
      "wasp",
      "waste",
      "water",
      "wave",
      "way",
      "wealth",
      "weapon",
      "wear",
      "weasel",
      "weather",
      "web",
      "wedding",
      "weekend",
      "weird",
      "welcome",
      "west",
      "wet",
      "whale",
      "what",
      "wheat",
      "wheel",
      "when",
      "where",
      "whip",
      "whisper",
      "wide",
      "width",
      "wife",
      "wild",
      "will",
      "win",
      "window",
      "wine",
      "wing",
      "wink",
      "winner",
      "winter",
      "wire",
      "wisdom",
      "wise",
      "wish",
      "witness",
      "wolf",
      "woman",
      "wonder",
      "wood",
      "wool",
      "word",
      "work",
      "world",
      "worry",
      "worth",
      "wrap",
      "wreck",
      "wrestle",
      "wrist",
      "write",
      "wrong",
      "yard",
      "year",
      "yellow",
      "you",
      "young",
      "youth",
      "zebra",
      "zero",
      "zone",
      "zoo"
    ];
    LEGACY_WORDLIST = [
      "abandon",
      "ability",
      "able",
      "about",
      "above",
      "absent",
      "absorb",
      "abstract",
      "absurd",
      "abuse",
      "access",
      "accident",
      "account",
      "accuse",
      "achieve",
      "acid",
      "acoustic",
      "acquire",
      "across",
      "act",
      "action",
      "actor",
      "actress",
      "actual",
      "adapt",
      "add",
      "addict",
      "address",
      "adjust",
      "admit",
      "adult",
      "advance",
      "advice",
      "aerobic",
      "affair",
      "afford",
      "afraid",
      "africa",
      "after",
      "again",
      "age",
      "agent",
      "agree",
      "ahead",
      "aim",
      "air",
      "airport",
      "aisle",
      "alarm",
      "album",
      "alcohol",
      "alert",
      "alien",
      "all",
      "alley",
      "allow",
      "almost",
      "alone",
      "alpha",
      "already",
      "also",
      "alter",
      "always",
      "amateur",
      "amazing",
      "among",
      "amount",
      "amused",
      "analyst",
      "anchor",
      "ancient",
      "anger",
      "angle",
      "angry",
      "animal",
      "ankle",
      "announce",
      "annual",
      "another",
      "answer",
      "antenna",
      "antique",
      "anxiety",
      "any",
      "apart",
      "apology",
      "appear",
      "apple",
      "approve",
      "april",
      "arch",
      "arctic",
      "area",
      "arena",
      "argue",
      "arm",
      "armed",
      "armor",
      "army",
      "around",
      "arrange",
      "arrest",
      "arrive",
      "arrow",
      "art",
      "artefact",
      "artist",
      "artwork",
      "ask",
      "aspect",
      "assault",
      "asset",
      "assist",
      "assume",
      "asthma",
      "athlete",
      "atom",
      "attack",
      "attend",
      "attitude",
      "attract",
      "auction",
      "audit",
      "august",
      "aunt",
      "author",
      "auto",
      "autumn",
      "average",
      "avocado",
      "avoid",
      "awake",
      "aware",
      "away",
      "awesome",
      "awful",
      "awkward",
      "axis",
      "baby",
      "bachelor",
      "bacon",
      "badge",
      "bag",
      "balance",
      "balcony",
      "ball",
      "bamboo",
      "banana",
      "banner",
      "bar",
      "barely",
      "bargain",
      "barrel",
      "base",
      "basic",
      "basket",
      "battle",
      "beach",
      "bean",
      "beauty",
      "because",
      "become",
      "beef",
      "before",
      "begin",
      "behave",
      "behind",
      "believe",
      "below",
      "belt",
      "bench",
      "benefit",
      "best",
      "betray",
      "better",
      "between",
      "beyond",
      "bicycle",
      "bid",
      "bike",
      "bind",
      "biology",
      "bird",
      "birth",
      "bitter",
      "black",
      "blade",
      "blame",
      "blanket",
      "blast",
      "bleak",
      "bless",
      "blind",
      "blood",
      "blossom",
      "blouse",
      "blue",
      "blur",
      "blush",
      "board",
      "boat",
      "body",
      "boil",
      "bomb",
      "bone",
      "bonus",
      "book",
      "boost",
      "border",
      "boring",
      "borrow",
      "boss",
      "bottom",
      "bounce",
      "box",
      "boy",
      "bracket",
      "brain",
      "brand",
      "brass",
      "brave",
      "bread",
      "breeze",
      "brick",
      "bridge",
      "brief",
      "bright",
      "bring",
      "brisk",
      "broccoli",
      "broken",
      "bronze",
      "broom",
      "brother",
      "brown",
      "brush",
      "bubble",
      "buddy",
      "budget",
      "buffalo",
      "build",
      "bulb",
      "bulk",
      "bullet",
      "bundle",
      "bunker",
      "burden",
      "burger",
      "burst",
      "bus",
      "business",
      "busy",
      "butter",
      "buyer",
      "buzz",
      "cabbage",
      "cabin",
      "cable",
      "cactus",
      "cage",
      "cake",
      "call",
      "calm",
      "camera",
      "camp",
      "can",
      "canal",
      "cancel",
      "candy",
      "cannon",
      "canoe",
      "canvas",
      "canyon",
      "capable",
      "capital",
      "captain",
      "car",
      "carbon",
      "card",
      "cargo",
      "carpet",
      "carry",
      "cart",
      "case",
      "cash",
      "casino",
      "castle",
      "casual",
      "cat",
      "catalog",
      "catch",
      "category",
      "cattle",
      "caught",
      "cause",
      "caution",
      "cave",
      "ceiling",
      "celery",
      "cement",
      "census",
      "century",
      "cereal",
      "certain",
      "chair",
      "chalk",
      "champion",
      "change",
      "chaos",
      "chapter",
      "charge",
      "chase",
      "chat",
      "cheap",
      "check",
      "cheese",
      "chef",
      "cherry",
      "chest",
      "chicken",
      "chief",
      "child",
      "chimney",
      "choice",
      "choose",
      "chronic",
      "chuckle",
      "chunk",
      "churn",
      "cigar",
      "cinnamon",
      "circle",
      "citizen",
      "city",
      "civil",
      "claim",
      "clap",
      "clarify",
      "claw",
      "clay",
      "clean",
      "clerk",
      "clever",
      "click",
      "client",
      "cliff",
      "climb",
      "clinic",
      "clip",
      "clock",
      "clog",
      "close",
      "cloth",
      "cloud",
      "clown",
      "club",
      "clump",
      "cluster",
      "clutch",
      "coach",
      "coast",
      "coconut",
      "code",
      "coffee",
      "coil",
      "coin",
      "collect",
      "color",
      "column",
      "combine",
      "come",
      "comfort",
      "comic",
      "common",
      "company",
      "concert",
      "conduct",
      "confirm",
      "congress",
      "connect",
      "consider",
      "control",
      "convince",
      "cook",
      "cool",
      "copper",
      "copy",
      "coral",
      "core",
      "corn",
      "correct",
      "cost",
      "cotton",
      "couch",
      "country",
      "couple",
      "course",
      "cousin",
      "cover",
      "coyote",
      "crack",
      "cradle",
      "craft",
      "cram",
      "crane",
      "crash",
      "crater",
      "crawl",
      "crazy",
      "cream",
      "credit",
      "creek",
      "crew",
      "cricket",
      "crime",
      "crisp",
      "critic",
      "crop",
      "cross",
      "crouch",
      "crowd",
      "crucial",
      "cruel",
      "cruise",
      "crumble",
      "crunch",
      "crush",
      "cry",
      "crystal",
      "cube",
      "culture",
      "cup",
      "cupboard",
      "curious",
      "current",
      "curtain",
      "curve",
      "cushion",
      "custom",
      "cute",
      "cycle",
      "dad",
      "damage",
      "damp",
      "dance",
      "danger",
      "daring",
      "dash",
      "daughter",
      "dawn",
      "day",
      "deal",
      "debate",
      "debris",
      "decade",
      "december",
      "decide",
      "decline",
      "decorate",
      "decrease",
      "deer",
      "defense",
      "define",
      "defy",
      "degree",
      "delay",
      "deliver",
      "demand",
      "demise",
      "denial",
      "dentist",
      "deny",
      "depart",
      "depend",
      "deposit",
      "depth",
      "deputy",
      "derive",
      "describe",
      "desert",
      "design",
      "desk",
      "despair",
      "destroy",
      "detail",
      "detect",
      "develop",
      "device",
      "devote",
      "diagram",
      "dial",
      "diamond",
      "diary",
      "dice",
      "diesel",
      "diet",
      "differ",
      "digital",
      "dignity",
      "dilemma",
      "dinner",
      "dinosaur",
      "direct",
      "dirt",
      "disagree",
      "discover",
      "disease",
      "dish",
      "dismiss",
      "disorder",
      "display",
      "distance",
      "divert",
      "divide",
      "divorce",
      "dizzy",
      "doctor",
      "document",
      "dog",
      "doll",
      "dolphin",
      "domain",
      "donate",
      "donkey",
      "donor",
      "door",
      "dose",
      "double",
      "dove",
      "draft",
      "dragon",
      "drama",
      "drastic",
      "draw",
      "dream",
      "dress",
      "drift",
      "drill",
      "drink",
      "drip",
      "drive",
      "drop",
      "drum",
      "dry",
      "duck",
      "dumb",
      "dune",
      "during",
      "dust",
      "dutch",
      "duty",
      "dwarf",
      "dynamic",
      "eager",
      "eagle",
      "early",
      "earn",
      "earth",
      "easily",
      "east",
      "easy",
      "echo",
      "ecology",
      "economy",
      "edge",
      "edit",
      "educate",
      "effort",
      "egg",
      "eight",
      "either",
      "elbow",
      "elder",
      "electric",
      "elegant",
      "element",
      "elephant",
      "elevator",
      "elite",
      "else",
      "embark",
      "embody",
      "embrace",
      "emerge",
      "emotion",
      "employ",
      "empower",
      "empty",
      "enable",
      "enact",
      "end",
      "endless",
      "endorse",
      "enemy",
      "energy",
      "enforce",
      "engage",
      "engine",
      "enhance",
      "enjoy",
      "enlist",
      "enough",
      "enrich",
      "enroll",
      "ensure",
      "enter",
      "entire",
      "entry",
      "envelope",
      "episode",
      "equal",
      "equip",
      "era",
      "erase",
      "erode",
      "erosion",
      "error",
      "erupt",
      "escape",
      "essay",
      "essence",
      "estate",
      "eternal",
      "ethics",
      "evidence",
      "evil",
      "evoke",
      "evolve",
      "exact",
      "example",
      "excess",
      "exchange",
      "excite",
      "exclude",
      "excuse",
      "execute",
      "exercise",
      "exhaust",
      "exhibit",
      "exile",
      "exist",
      "exit",
      "exotic",
      "expand",
      "expect",
      "expire",
      "explain",
      "expose",
      "express",
      "extend",
      "extra",
      "eye",
      "eyebrow",
      "fabric",
      "face",
      "faculty",
      "fade",
      "faint",
      "faith",
      "fall",
      "false",
      "fame",
      "family",
      "famous",
      "fan",
      "fancy",
      "fantasy",
      "farm",
      "fashion",
      "fat",
      "fatal",
      "father",
      "fatigue",
      "fault",
      "favorite",
      "feature",
      "february",
      "federal",
      "fee",
      "feed",
      "feel",
      "female",
      "fence",
      "festival",
      "fetch",
      "fever",
      "few",
      "fiber",
      "fiction",
      "field",
      "figure",
      "file",
      "film",
      "filter",
      "final",
      "find",
      "fine",
      "finger",
      "finish",
      "fire",
      "firm",
      "first",
      "fiscal",
      "fish",
      "fit",
      "fitness",
      "fix",
      "flag",
      "flame",
      "flash",
      "flat",
      "flavor",
      "flee",
      "flight",
      "flip",
      "float",
      "flock",
      "floor",
      "flower",
      "fluid",
      "flush",
      "fly",
      "foam",
      "focus",
      "fog",
      "foil",
      "fold",
      "follow",
      "food",
      "foot",
      "force",
      "forest",
      "forget",
      "fork",
      "fortune",
      "forum",
      "forward",
      "fossil",
      "foster",
      "found",
      "fox",
      "fragile",
      "frame",
      "frequent",
      "fresh",
      "friend",
      "fringe",
      "frog",
      "front",
      "frost",
      "frown",
      "frozen",
      "fruit",
      "fuel",
      "fun",
      "funny",
      "furnace",
      "fury",
      "future",
      "gadget",
      "gain",
      "galaxy",
      "gallery",
      "game",
      "gap",
      "garage",
      "garbage",
      "garden",
      "garlic",
      "garment",
      "gas",
      "gasp",
      "gate",
      "gather",
      "gauge",
      "gaze",
      "general",
      "genius",
      "genre",
      "gentle",
      "genuine",
      "gesture",
      "ghost",
      "giant",
      "gift",
      "giggle",
      "ginger",
      "giraffe",
      "girl",
      "give",
      "glad",
      "glance",
      "glare",
      "glass",
      "glide",
      "glimpse",
      "globe",
      "gloom",
      "glory",
      "glove",
      "glow",
      "glue",
      "goat",
      "goddess",
      "gold",
      "good",
      "goose",
      "gorilla",
      "gospel",
      "gossip",
      "govern",
      "gown",
      "grab",
      "grace",
      "grain",
      "grant",
      "grape",
      "grass",
      "gravity",
      "great",
      "green",
      "grid",
      "grief",
      "grit",
      "grocery",
      "group",
      "grow",
      "grunt",
      "guard",
      "guess",
      "guide",
      "guilt",
      "guitar",
      "gun",
      "gym",
      "habit",
      "hair",
      "half",
      "hammer",
      "hamster",
      "hand",
      "happy",
      "harbor",
      "hard",
      "harsh",
      "harvest",
      "hat",
      "have",
      "hawk",
      "hazard",
      "head",
      "health",
      "heart",
      "heavy",
      "hedgehog",
      "height",
      "hello",
      "helmet",
      "help",
      "hen",
      "hero",
      "hidden",
      "high",
      "hill",
      "hint",
      "hip",
      "hire",
      "history",
      "hobby",
      "hockey",
      "hold",
      "hole",
      "holiday",
      "hollow",
      "home",
      "honey",
      "hood",
      "hope",
      "horn",
      "horror",
      "horse",
      "hospital",
      "host",
      "hotel",
      "hour",
      "hover",
      "hub",
      "huge",
      "human",
      "humble",
      "humor",
      "hundred",
      "hungry",
      "hunt",
      "hurdle",
      "hurry",
      "hurt",
      "husband",
      "hybrid",
      "ice",
      "icon",
      "idea",
      "identify",
      "idle",
      "ignore",
      "ill",
      "illegal",
      "illness",
      "image",
      "imitate",
      "immense",
      "immune",
      "impact",
      "impose",
      "improve",
      "impulse",
      "inch",
      "include",
      "income",
      "increase",
      "index",
      "indicate",
      "indoor",
      "industry",
      "infant",
      "inflict",
      "inform",
      "inhale",
      "inherit",
      "initial",
      "inject",
      "injury",
      "inmate",
      "inner",
      "innocent",
      "input",
      "inquiry",
      "insane",
      "insect",
      "inside",
      "inspire",
      "install",
      "intact",
      "interest",
      "into",
      "invest",
      "invite",
      "island",
      "isolate",
      "issue",
      "item",
      "ivory",
      "jacket",
      "jaguar",
      "jar",
      "jazz",
      "jealous",
      "jeans",
      "jelly",
      "jewel",
      "job",
      "join",
      "joke",
      "journey",
      "joy",
      "judge",
      "juice",
      "jump",
      "jungle",
      "junior",
      "junk",
      "just",
      "kangaroo",
      "keen",
      "keep",
      "ketchup",
      "key",
      "kick",
      "kid",
      "kidney",
      "kind",
      "kingdom",
      "kiss",
      "kit",
      "kitchen",
      "kite",
      "kitten",
      "kiwi",
      "knee",
      "knife",
      "knock",
      "know",
      "lab",
      "label",
      "labor",
      "ladder",
      "lady",
      "lake",
      "lamp",
      "language",
      "laptop",
      "large",
      "later",
      "latin",
      "laugh",
      "laundry",
      "lava",
      "law",
      "lawn",
      "lawsuit",
      "layer",
      "lazy",
      "leader",
      "leaf",
      "learn",
      "leave",
      "lecture",
      "left",
      "leg",
      "legal",
      "legend",
      "leisure",
      "lemon",
      "lend",
      "length",
      "lens",
      "leopard",
      "lesson",
      "letter",
      "level",
      "liar",
      "liberty",
      "life",
      "light",
      "like",
      "limb",
      "limit",
      "link",
      "lion",
      "liquid",
      "list",
      "little",
      "live",
      "lizard",
      "load",
      "loan",
      "lobster",
      "local",
      "lock",
      "logic",
      "lonely",
      "long",
      "loop",
      "lottery",
      "loud",
      "lounge",
      "love",
      "loyal",
      "lucky",
      "luggage",
      "lumber",
      "lunar",
      "lunch",
      "luxury",
      "lyrics",
      "machine",
      "mad",
      "magic",
      "magnet",
      "maid",
      "mail",
      "main",
      "major",
      "make",
      "mammal",
      "man",
      "manage",
      "mandate",
      "mango",
      "mansion",
      "manual",
      "maple",
      "marble",
      "march",
      "margin",
      "marine",
      "market",
      "marriage",
      "mask",
      "mass",
      "master",
      "match",
      "material",
      "math",
      "matrix",
      "matter",
      "maximum",
      "maze",
      "meadow",
      "mean",
      "measure",
      "meat",
      "mechanic",
      "medal",
      "media",
      "melody",
      "melt",
      "member",
      "memory",
      "mention",
      "menu",
      "mercy",
      "merge",
      "merit",
      "merry",
      "mesh",
      "message",
      "metal",
      "method",
      "middle",
      "midnight",
      "milk",
      "million",
      "mimic",
      "mind",
      "minimum",
      "minor",
      "minute",
      "miracle",
      "mirror",
      "misery",
      "miss",
      "mistake",
      "mix",
      "mixed",
      "mixture",
      "mobile",
      "model",
      "modify",
      "mom",
      "moment",
      "monitor",
      "monkey",
      "monster",
      "month",
      "moon",
      "moral",
      "more",
      "morning",
      "mosquito",
      "mother",
      "motion",
      "motor",
      "mountain",
      "mouse",
      "move",
      "movie",
      "much",
      "muffin",
      "mule",
      "multiply",
      "muscle",
      "museum",
      "mushroom",
      "music",
      "must",
      "mutual",
      "myself",
      "mystery",
      "myth",
      "naive",
      "name",
      "napkin",
      "narrow",
      "nasty",
      "nation",
      "nature",
      "near",
      "neck",
      "need",
      "negative",
      "neglect",
      "neither",
      "nephew",
      "nerve",
      "nest",
      "net",
      "network",
      "neutral",
      "never",
      "news",
      "next",
      "nice",
      "night",
      "noble",
      "noise",
      "nominee",
      "noodle",
      "normal",
      "north",
      "nose",
      "notable",
      "note",
      "nothing",
      "notice",
      "novel",
      "now",
      "nuclear",
      "number",
      "nurse",
      "nut",
      "oak",
      "obey",
      "object",
      "oblige",
      "obscure",
      "observe",
      "obtain",
      "obvious",
      "occur",
      "ocean",
      "october",
      "odor",
      "off",
      "offer",
      "office",
      "often",
      "oil",
      "okay",
      "old",
      "olive",
      "olympic",
      "omit",
      "once",
      "one",
      "onion",
      "online",
      "only",
      "open",
      "opera",
      "opinion",
      "oppose",
      "option",
      "orange",
      "orbit",
      "orchard",
      "order",
      "ordinary",
      "organ",
      "orient",
      "original",
      "orphan",
      "ostrich",
      "other",
      "outdoor",
      "outer",
      "output",
      "outside",
      "oval",
      "oven",
      "over",
      "own",
      "owner",
      "oxygen",
      "oyster",
      "ozone",
      "pact",
      "paddle",
      "page",
      "pair",
      "palace",
      "palm",
      "panda",
      "panel",
      "panic",
      "panther",
      "paper",
      "parade",
      "parent",
      "park",
      "parrot",
      "party",
      "pass",
      "patch",
      "path",
      "patient",
      "patrol",
      "pattern",
      "pause",
      "pave",
      "payment",
      "peace",
      "peanut",
      "pear",
      "peasant",
      "pelican",
      "pen",
      "penalty",
      "pencil",
      "people",
      "pepper",
      "perfect",
      "permit",
      "person",
      "pet",
      "phone",
      "photo",
      "phrase",
      "physical",
      "piano",
      "picnic",
      "picture",
      "piece",
      "pig",
      "pigeon",
      "pill",
      "pilot",
      "pink",
      "pioneer",
      "pipe",
      "pistol",
      "pitch",
      "pizza",
      "place",
      "planet",
      "plastic",
      "plate",
      "play",
      "please",
      "pledge",
      "pluck",
      "plug",
      "plunge",
      "poem",
      "poet",
      "point",
      "polar",
      "pole",
      "police",
      "pond",
      "pony",
      "pool",
      "popular",
      "portion",
      "position",
      "possible",
      "post",
      "potato",
      "pottery",
      "poverty",
      "powder",
      "power",
      "practice",
      "praise",
      "predict",
      "prefer",
      "prepare",
      "present",
      "pretty",
      "prevent",
      "price",
      "pride",
      "primary",
      "print",
      "priority",
      "prison",
      "private",
      "prize",
      "problem",
      "process",
      "produce",
      "profit",
      "program",
      "project",
      "promote",
      "proof",
      "property",
      "prosper",
      "protect",
      "proud",
      "provide",
      "public",
      "pudding",
      "pull",
      "pulp",
      "pulse",
      "pumpkin",
      "punch",
      "pupil",
      "puppy",
      "purchase",
      "purity",
      "purpose",
      "purse",
      "push",
      "put",
      "puzzle",
      "pyramid",
      "quality",
      "quantum",
      "quarter",
      "question",
      "quick",
      "quit",
      "quiz",
      "quote",
      "rabbit",
      "raccoon",
      "race",
      "rack",
      "radar",
      "radio",
      "rail",
      "rain",
      "raise",
      "rally",
      "ramp",
      "ranch",
      "random",
      "range",
      "rapid",
      "rare",
      "rate",
      "rather",
      "raven",
      "raw",
      "razor",
      "ready",
      "real",
      "reason",
      "rebel",
      "rebuild",
      "recall",
      "receive",
      "recipe",
      "record",
      "recycle",
      "reduce",
      "reflect",
      "reform",
      "refuse",
      "region",
      "regret",
      "regular",
      "reject",
      "relax",
      "release",
      "relief",
      "rely",
      "remain",
      "remember",
      "remind",
      "remove",
      "render",
      "renew",
      "rent",
      "reopen",
      "repair",
      "repeat",
      "replace",
      "report",
      "require",
      "rescue",
      "resemble",
      "resist",
      "resource",
      "response",
      "result",
      "retire",
      "retreat",
      "return",
      "reunion",
      "reveal",
      "review",
      "reward",
      "rhythm",
      "rib",
      "ribbon",
      "rice",
      "rich",
      "ride",
      "ridge",
      "rifle",
      "right",
      "rigid",
      "ring",
      "riot",
      "ripple",
      "risk",
      "ritual",
      "rival",
      "river",
      "road",
      "roast",
      "robot",
      "robust",
      "rocket",
      "romance",
      "roof",
      "rookie",
      "room",
      "rose",
      "rotate",
      "rough",
      "round",
      "route",
      "royal",
      "rubber",
      "rude",
      "rug",
      "rule",
      "run",
      "runway",
      "rural",
      "sad",
      "saddle",
      "sadness",
      "safe",
      "sail",
      "salad",
      "salmon",
      "salon",
      "salt",
      "salute",
      "same",
      "sample",
      "sand",
      "satisfy",
      "satoshi",
      "sauce",
      "sausage",
      "save",
      "say",
      "scale",
      "scan",
      "scare",
      "scatter",
      "scene",
      "scheme",
      "school",
      "science",
      "scissors",
      "scorpion",
      "scout",
      "scrap",
      "screen",
      "script",
      "scrub",
      "sea",
      "search",
      "season",
      "seat",
      "second",
      "secret",
      "section",
      "security",
      "seed",
      "seek",
      "segment",
      "select",
      "sell",
      "seminar",
      "senior",
      "sense",
      "sentence",
      "series",
      "service",
      "session",
      "settle",
      "setup",
      "seven",
      "shadow",
      "shaft",
      "shallow",
      "share",
      "shed",
      "shell",
      "sheriff",
      "shield",
      "shift",
      "shine",
      "ship",
      "shiver",
      "shock",
      "shoe",
      "shoot",
      "shop",
      "short",
      "shoulder",
      "shove",
      "shrimp",
      "shrug",
      "shuffle",
      "shy",
      "sibling",
      "sick",
      "side",
      "siege",
      "sight",
      "sign",
      "silent",
      "silk",
      "silly",
      "silver",
      "similar",
      "simple",
      "since",
      "sing",
      "siren",
      "sister",
      "situate",
      "six",
      "size",
      "skate",
      "sketch",
      "ski",
      "skill",
      "skin",
      "skirt",
      "skull",
      "slab",
      "slam",
      "sleep",
      "slender",
      "slice",
      "slide",
      "slight",
      "slim",
      "slogan",
      "slot",
      "slow",
      "slush",
      "small",
      "smart",
      "smile",
      "smoke",
      "smooth",
      "snack",
      "snake",
      "snap",
      "sniff",
      "snow",
      "soap",
      "soccer",
      "social",
      "sock",
      "soda",
      "soft",
      "solar",
      "soldier",
      "solid",
      "solution",
      "solve",
      "someone",
      "song",
      "soon",
      "sorry",
      "sort",
      "soul",
      "sound",
      "soup",
      "source",
      "south",
      "space",
      "spare",
      "spatial",
      "spawn",
      "speak",
      "special",
      "speed",
      "spell",
      "spend",
      "sphere",
      "spice",
      "spider",
      "spike",
      "spin",
      "spirit",
      "split",
      "spoil",
      "sponsor",
      "spoon",
      "sport",
      "spot",
      "spray",
      "spread",
      "spring",
      "spy",
      "square",
      "squeeze",
      "squirrel",
      "stable",
      "stadium",
      "staff",
      "stage",
      "stairs",
      "stamp",
      "stand",
      "start",
      "state",
      "stay",
      "steak",
      "steel",
      "stem",
      "step",
      "stereo",
      "stick",
      "still",
      "sting",
      "stock",
      "stomach",
      "stone",
      "stool",
      "story",
      "stove",
      "strategy",
      "street",
      "strike",
      "strong",
      "struggle",
      "student",
      "stuff",
      "stumble",
      "style",
      "subject",
      "submit",
      "subway",
      "success",
      "such",
      "sudden",
      "suffer",
      "sugar",
      "suggest",
      "suit",
      "summer",
      "sun",
      "sunny",
      "sunset",
      "super",
      "supply",
      "supreme",
      "sure",
      "surface",
      "surge",
      "surprise",
      "surround",
      "survey",
      "suspect",
      "sustain",
      "swallow",
      "swamp",
      "swap",
      "swarm",
      "swear",
      "sweet",
      "swift",
      "swim",
      "swing",
      "switch",
      "sword",
      "symbol",
      "symptom",
      "syrup",
      "system",
      "table",
      "tackle",
      "tag",
      "tail",
      "talent",
      "talk",
      "tank",
      "tape",
      "target",
      "task",
      "taste",
      "tattoo",
      "taxi",
      "teach",
      "team",
      "tell",
      "ten",
      "tenant",
      "tennis",
      "tent",
      "term",
      "test",
      "text",
      "thank",
      "that",
      "theme",
      "then",
      "theory",
      "there",
      "they",
      "thing",
      "this",
      "thought",
      "three",
      "thrive",
      "throw",
      "thumb",
      "thunder",
      "ticket",
      "tide",
      "tiger",
      "tilt",
      "timber",
      "time",
      "tiny",
      "tip",
      "tired",
      "tissue",
      "title",
      "toast",
      "tobacco",
      "today",
      "toddler",
      "toe",
      "together",
      "toilet",
      "token",
      "tomato",
      "tomorrow",
      "tone",
      "tongue",
      "tonight",
      "tool",
      "tooth",
      "top",
      "topic",
      "topple",
      "torch",
      "tornado",
      "tortoise",
      "toss",
      "total",
      "tourist",
      "toward",
      "tower",
      "town",
      "toy",
      "track",
      "trade",
      "traffic",
      "tragic",
      "train",
      "transfer",
      "trap",
      "trash",
      "travel",
      "tray",
      "treat",
      "tree",
      "trend",
      "trial",
      "tribe",
      "trick",
      "trigger",
      "trim",
      "trip",
      "trophy",
      "trouble",
      "truck",
      "true",
      "truly",
      "trumpet",
      "trust",
      "truth",
      "try",
      "tube",
      "tuition",
      "tumble",
      "tuna",
      "tunnel",
      "turkey",
      "turn",
      "turtle",
      "twelve",
      "twenty",
      "twice",
      "twin",
      "twist",
      "two",
      "type",
      "typical",
      "ugly",
      "umbrella",
      "unable",
      "unaware",
      "uncle",
      "uncover",
      "under",
      "undo",
      "unfair",
      "unfold",
      "unhappy",
      "uniform",
      "unique",
      "unit",
      "universe",
      "unknown",
      "unlock",
      "until",
      "unusual",
      "unveil",
      "update",
      "upgrade",
      "uphold",
      "upon",
      "upper",
      "upset",
      "urban",
      "urge",
      "usage",
      "use",
      "used",
      "useful",
      "useless",
      "usual",
      "utility",
      "vacant",
      "vacuum",
      "vague",
      "valid",
      "valley",
      "valve",
      "van",
      "vanish",
      "vapor",
      "various",
      "vast",
      "vault",
      "vehicle",
      "velvet",
      "vendor",
      "venture",
      "venue",
      "verb",
      "verify",
      "version",
      "very",
      "vessel",
      "veteran",
      "viable",
      "vibrant",
      "vicious",
      "victory",
      "video",
      "view",
      "village",
      "vintage",
      "violin",
      "virtual",
      "virus",
      "visa",
      "visit",
      "visual",
      "vital",
      "vivid",
      "vocal",
      "voice",
      "void",
      "volcano",
      "volume",
      "vote",
      "voyage",
      "wage",
      "wagon",
      "wait",
      "walk",
      "wall",
      "walnut",
      "want",
      "warfare",
      "warm",
      "warrior",
      "wash",
      "wasp",
      "waste",
      "water",
      "wave",
      "way",
      "wealth",
      "weapon",
      "wear",
      "weasel",
      "weather",
      "web",
      "wedding",
      "weekend",
      "weird",
      "welcome",
      "west",
      "wet",
      "whale",
      "what",
      "wheat",
      "wheel",
      "when",
      "where",
      "whip",
      "whisper",
      "wide",
      "width",
      "wife",
      "wild",
      "will",
      "win",
      "window",
      "wine",
      "wing",
      "wink",
      "winner",
      "winter",
      "wire",
      "wisdom",
      "wise",
      "wish",
      "witness",
      "wolf",
      "woman",
      "wonder",
      "wood",
      "wool",
      "word",
      "work",
      "world",
      "worry",
      "worth",
      "wrap",
      "wreck",
      "wrestle",
      "wrist",
      "write",
      "wrong",
      "yard",
      "year",
      "yellow",
      "you",
      "young",
      "youth",
      "zebra",
      "zero",
      "zone",
      "zoo",
      "involve",
      "iron",
      "library"
    ];
  }
});

// src/lib/wallet/keys.ts
var keys_exports = {};
__export(keys_exports, {
  BIP39_SEED_WORD_COUNT: () => BIP39_SEED_WORD_COUNT,
  LEGACY_SEED_WORD_COUNT: () => LEGACY_SEED_WORD_COUNT,
  generateKeyPair: () => generateKeyPair,
  generateMnemonic: () => generateMnemonic,
  getPublicKey: () => getPublicKey,
  mnemonicToPrivateKey: () => mnemonicToPrivateKey,
  mnemonicToSeed: () => mnemonicToSeed,
  privateKeyToSeed: () => privateKeyToSeed,
  seedToPrivateKey: () => seedToPrivateKey,
  verifyKeyPair: () => verifyKeyPair
});
function bytesToHex3(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
function normalizeMnemonic(mnemonic) {
  return mnemonic.trim().toLowerCase().split(/\s+/);
}
function randomEntropy() {
  const entropy = new Uint8Array(ENTROPY_BYTES);
  crypto.getRandomValues(entropy);
  return entropy;
}
function entropyToMnemonic(entropy) {
  if (entropy.length !== ENTROPY_BYTES) {
    throw new Error(`Invalid entropy length: expected ${ENTROPY_BYTES} bytes, got ${entropy.length}`);
  }
  const hash = sha256(entropy);
  const checksum2 = hash[0] >> 8 - CHECKSUM_BITS;
  const indices = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const pushBits = (value, count) => {
    bitBuffer = bitBuffer << count | value;
    bitCount += count;
    while (bitCount >= BITS_PER_WORD) {
      bitCount -= BITS_PER_WORD;
      indices.push(bitBuffer >> bitCount & 2047);
    }
  };
  for (const byte of entropy) {
    pushBits(byte, 8);
  }
  pushBits(checksum2, CHECKSUM_BITS);
  return indices.map((i) => WORDLIST[i]).join(" ");
}
function mnemonicToEntropy(mnemonic) {
  const words = normalizeMnemonic(mnemonic);
  if (words.length !== BIP39_SEED_WORD_COUNT) {
    throw new Error(
      `Invalid mnemonic: expected ${BIP39_SEED_WORD_COUNT} words, got ${words.length}`
    );
  }
  const indices = [];
  for (const word of words) {
    const index = WORDLIST.indexOf(word);
    if (index === -1) {
      throw new Error(`Invalid seed word: "${word}" not found in wordlist`);
    }
    indices.push(index);
  }
  const entropy = new Uint8Array(ENTROPY_BYTES);
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (const idx of indices) {
    bitBuffer = bitBuffer << BITS_PER_WORD | idx;
    bitCount += BITS_PER_WORD;
    while (bitCount >= 8 && byteIndex < ENTROPY_BYTES) {
      bitCount -= 8;
      entropy[byteIndex++] = bitBuffer >> bitCount & 255;
    }
  }
  const storedChecksum = bitBuffer & (1 << CHECKSUM_BITS) - 1;
  const hash = sha256(entropy);
  const expectedChecksum = hash[0] >> 8 - CHECKSUM_BITS;
  if (storedChecksum !== expectedChecksum) {
    throw new Error("Invalid seed phrase: checksum mismatch \u2014 check your words");
  }
  return entropy;
}
function mnemonicToSeed(mnemonic) {
  mnemonicToEntropy(mnemonic);
  const normalized = normalizeMnemonic(mnemonic).join(" ");
  const salt = BIP39_SALT_PREFIX;
  return pbkdf2(sha512, normalized, salt, {
    c: BIP39_PBKDF2_ITERATIONS,
    dkLen: BIP39_SEED_BYTES
  });
}
function mnemonicToPrivateKey(mnemonic) {
  const seedBytes = mnemonicToSeed(mnemonic);
  const keyBytes = seedBytes.slice(0, PRIVATE_KEY_BYTES);
  if (!secp256k1.utils.isValidSecretKey(keyBytes)) {
    throw new Error("Invalid BIP39 seed: derived private key is out of range");
  }
  return base64url.encode(keyBytes);
}
function generateMnemonic() {
  return entropyToMnemonic(randomEntropy());
}
function generateKeyPair() {
  let mnemonic;
  let keyBytes;
  do {
    mnemonic = generateMnemonic();
    keyBytes = mnemonicToSeed(mnemonic).slice(0, PRIVATE_KEY_BYTES);
  } while (!secp256k1.utils.isValidSecretKey(keyBytes));
  const publicKeyBytes = secp256k1.getPublicKey(keyBytes, true);
  return {
    privateKey: base64url.encode(keyBytes),
    publicKey: bytesToHex3(publicKeyBytes),
    mnemonic
  };
}
function getPublicKey(privateKey) {
  const keyBytes = base64url.decode(privateKey);
  const pubBytes = secp256k1.getPublicKey(keyBytes, true);
  return bytesToHex3(pubBytes);
}
function verifyKeyPair(privateKey, publicKey) {
  try {
    const derived = getPublicKey(privateKey);
    return derived === publicKey;
  } catch {
    return false;
  }
}
function seedToPrivateKey(seed) {
  const words = normalizeMnemonic(seed);
  if (words.length === BIP39_SEED_WORD_COUNT) {
    return mnemonicToPrivateKey(words.join(" "));
  }
  if (words.length === LEGACY_SEED_WORD_COUNT) {
    return legacySeedToPrivateKey(words);
  }
  throw new Error(
    `Invalid seed phrase: expected ${BIP39_SEED_WORD_COUNT} or ${LEGACY_SEED_WORD_COUNT} words, got ${words.length}`
  );
}
function privateKeyToSeed(privateKey) {
  const keyBytes = base64url.decode(privateKey);
  if (keyBytes.length !== PRIVATE_KEY_BYTES) {
    throw new Error(`Invalid private key length: expected ${PRIVATE_KEY_BYTES}, got ${keyBytes.length}`);
  }
  const hash = sha256(keyBytes);
  const checksum2 = hash[0];
  const combined = new Uint8Array(LEGACY_TOTAL_BYTES);
  combined.set(keyBytes, 0);
  combined[LEGACY_TOTAL_BYTES - 1] = checksum2;
  const indices = bytesToWords(combined);
  return indices.map((i) => LEGACY_WORDLIST[i]).join(" ");
}
function bytesToWords(bytes) {
  const words = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (let i = 0; i < bytes.length; i++) {
    bitBuffer = bitBuffer << 8 | bytes[i];
    bitCount += 8;
    while (bitCount >= BITS_PER_WORD) {
      bitCount -= BITS_PER_WORD;
      const index = bitBuffer >> bitCount & 2047;
      words.push(index);
    }
  }
  return words;
}
function wordsToBytes(indices, expectedBytes) {
  const result = new Uint8Array(expectedBytes);
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (const idx of indices) {
    bitBuffer = bitBuffer << BITS_PER_WORD | idx;
    bitCount += BITS_PER_WORD;
    while (bitCount >= 8 && byteIndex < expectedBytes) {
      bitCount -= 8;
      result[byteIndex++] = bitBuffer >> bitCount & 255;
    }
  }
  return result;
}
function legacySeedToPrivateKey(words) {
  const indices = [];
  for (const word of words) {
    const index = LEGACY_WORDLIST.indexOf(word);
    if (index === -1) {
      throw new Error(`Invalid seed word: "${word}" not found in wordlist`);
    }
    indices.push(index);
  }
  const combined = wordsToBytes(indices, LEGACY_TOTAL_BYTES);
  const keyBytes = combined.slice(0, PRIVATE_KEY_BYTES);
  const storedChecksum = combined[LEGACY_TOTAL_BYTES - 1];
  const hash = sha256(keyBytes);
  const computedChecksum = hash[0];
  if (storedChecksum !== computedChecksum) {
    throw new Error("Invalid seed phrase: checksum mismatch \u2014 check your words");
  }
  return base64url.encode(keyBytes);
}
var PRIVATE_KEY_BYTES, BITS_PER_WORD, BIP39_SEED_WORD_COUNT, ENTROPY_BYTES, ENTROPY_BITS, CHECKSUM_BITS, BIP39_PBKDF2_ITERATIONS, BIP39_SEED_BYTES, BIP39_SALT_PREFIX, LEGACY_SEED_WORD_COUNT, LEGACY_CHECKSUM_BYTES, LEGACY_TOTAL_BYTES;
var init_keys = __esm({
  "src/lib/wallet/keys.ts"() {
    init_secp256k1();
    init_sha2();
    init_pbkdf2();
    init_base64();
    init_wordlist();
    PRIVATE_KEY_BYTES = 32;
    BITS_PER_WORD = 11;
    BIP39_SEED_WORD_COUNT = 12;
    ENTROPY_BYTES = 16;
    ENTROPY_BITS = ENTROPY_BYTES * 8;
    CHECKSUM_BITS = ENTROPY_BITS / 32;
    BIP39_PBKDF2_ITERATIONS = 2048;
    BIP39_SEED_BYTES = 64;
    BIP39_SALT_PREFIX = "mnemonic";
    LEGACY_SEED_WORD_COUNT = 24;
    LEGACY_CHECKSUM_BYTES = 1;
    LEGACY_TOTAL_BYTES = PRIVATE_KEY_BYTES + LEGACY_CHECKSUM_BYTES;
  }
});

// src/lib/crypto/encrypt.ts
function assertSecureContext() {
  if (!globalThis.isSecureContext) {
    throw new Error(
      "SECURE_CONTEXT_REQUIRED: crypto.subtle is unavailable in non-Secure Context.\nWeb Crypto API (crypto.subtle) requires HTTPS or localhost.\nSolution: Use HTTPS (generate cert with scripts/generate-cert.sh) or access via localhost."
    );
  }
}
function toUint8Array(buf) {
  return new Uint8Array(buf);
}
function encodeBase64url(data) {
  return base64url.encode(data);
}
function decodeBase64url(data) {
  return base64url.decode(data);
}
function generateSalt(length = SALT_LENGTH) {
  const buf = new ArrayBuffer(length);
  const view = new Uint8Array(buf);
  crypto.getRandomValues(view);
  return view;
}
function generateIV() {
  const buf = new ArrayBuffer(IV_LENGTH);
  const view = new Uint8Array(buf);
  crypto.getRandomValues(view);
  return view;
}
async function deriveAesKey(pin, salt) {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      pinBytes,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt.buffer,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      {
        name: KEY_USAGE,
        length: AES_KEY_LENGTH
      },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (err) {
    throw new Error(
      `ENCRYPT_FAILED: Key derivation failed.
Ensure secure context (HTTPS or localhost) is active.
Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
async function deriveHashKey(pin, salt) {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      pinBytes,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt.buffer,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      {
        name: "HMAC",
        hash: "SHA-256",
        length: HASH_LENGTH * 8
      },
      false,
      ["sign"]
    );
  } catch (err) {
    throw new Error(
      `ENCRYPT_FAILED: Hash key derivation failed.
Ensure secure context (HTTPS or localhost) is active.
Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
async function hashPin(pin) {
  assertSecureContext();
  const salt = generateSalt();
  const key = await deriveHashKey(pin, salt);
  const encoder = new TextEncoder();
  try {
    const hashBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode("lnwcash-pin"));
    return {
      salt: encodeBase64url(salt),
      hash: encodeBase64url(toUint8Array(hashBuffer)),
      iterations: PBKDF2_ITERATIONS
    };
  } catch (err) {
    throw new Error(
      `ENCRYPT_FAILED: PIN hashing failed.
Ensure secure context (HTTPS or localhost) is active.
Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
async function verifyPin(pin, storedHash) {
  assertSecureContext();
  try {
    const saltBytes = decodeBase64url(storedHash.salt);
    const key = await deriveHashKey(pin, saltBytes);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode("lnwcash-pin"));
    return encodeBase64url(toUint8Array(hashBuffer)) === storedHash.hash;
  } catch {
    return false;
  }
}
async function encryptKey(privateKey, pin) {
  assertSecureContext();
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveAesKey(pin, salt);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(privateKey);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: KEY_USAGE,
        iv: iv.buffer
      },
      key,
      plaintext
    );
    return {
      salt: encodeBase64url(salt),
      iv: encodeBase64url(iv),
      iterations: PBKDF2_ITERATIONS,
      data: encodeBase64url(toUint8Array(ciphertext))
    };
  } catch (err) {
    throw new Error(
      `ENCRYPT_FAILED: Encryption failed.
Ensure secure context (HTTPS or localhost) is active.
Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
async function decryptKey(encryptedKey, pin) {
  assertSecureContext();
  const saltBytes = decodeBase64url(encryptedKey.salt);
  const ivBytes = decodeBase64url(encryptedKey.iv);
  const ciphertext = decodeBase64url(encryptedKey.data);
  const key = await deriveAesKey(pin, saltBytes);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: KEY_USAGE,
        iv: ivBytes.buffer
      },
      key,
      ciphertext.buffer
    );
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (err) {
    throw new Error(
      `ENCRYPT_FAILED: Decryption failed.
Ensure secure context (HTTPS or localhost) is active.
Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
var PBKDF2_ITERATIONS, SALT_LENGTH, IV_LENGTH, HASH_LENGTH, AES_KEY_LENGTH, KEY_USAGE;
var init_encrypt = __esm({
  "src/lib/crypto/encrypt.ts"() {
    init_base64();
    PBKDF2_ITERATIONS = 6e5;
    SALT_LENGTH = 32;
    IV_LENGTH = 12;
    HASH_LENGTH = 32;
    AES_KEY_LENGTH = 256;
    KEY_USAGE = "AES-GCM";
  }
});

// node_modules/.pnpm/@capacitor+core@8.5.0/node_modules/@capacitor/core/dist/index.cjs.js
var require_index_cjs = __commonJS({
  "node_modules/.pnpm/@capacitor+core@8.5.0/node_modules/@capacitor/core/dist/index.cjs.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ExceptionCode = void 0;
    (function(ExceptionCode) {
      ExceptionCode["Unimplemented"] = "UNIMPLEMENTED";
      ExceptionCode["Unavailable"] = "UNAVAILABLE";
    })(exports.ExceptionCode || (exports.ExceptionCode = {}));
    var CapacitorException = class extends Error {
      constructor(message, code, data) {
        super(message);
        this.message = message;
        this.code = code;
        this.data = data;
      }
    };
    var getPlatformId = (win) => {
      var _a, _b;
      if (win === null || win === void 0 ? void 0 : win.androidBridge) {
        return "android";
      } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
        return "ios";
      } else {
        return "web";
      }
    };
    var createCapacitor = (win) => {
      const capCustomPlatform = win.CapacitorCustomPlatform || null;
      const cap = win.Capacitor || {};
      const Plugins = cap.Plugins = cap.Plugins || {};
      const getPlatform = () => {
        return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
      };
      const isNativePlatform2 = () => getPlatform() !== "web";
      const isPluginAvailable = (pluginName) => {
        const plugin = registeredPlugins.get(pluginName);
        if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
          return true;
        }
        if (getPluginHeader(pluginName)) {
          return true;
        }
        return false;
      };
      const getPluginHeader = (pluginName) => {
        var _a;
        return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
      };
      const handleError = (err) => win.console.error(err);
      const registeredPlugins = /* @__PURE__ */ new Map();
      const registerPlugin2 = (pluginName, jsImplementations = {}) => {
        const registeredPlugin = registeredPlugins.get(pluginName);
        if (registeredPlugin) {
          console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
          return registeredPlugin.proxy;
        }
        const platform = getPlatform();
        const pluginHeader = getPluginHeader(pluginName);
        let jsImplementation;
        const loadPluginImplementation = async () => {
          if (!jsImplementation && platform in jsImplementations) {
            jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
          } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
            jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
          }
          return jsImplementation;
        };
        const createPluginMethod = (impl, prop) => {
          var _a, _b;
          if (pluginHeader) {
            const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
            if (methodHeader) {
              if (methodHeader.rtype === "promise") {
                return (options) => cap.nativePromise(pluginName, prop.toString(), options);
              } else {
                return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
              }
            } else if (impl) {
              return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
            }
          } else if (impl) {
            return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
          } else {
            throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, exports.ExceptionCode.Unimplemented);
          }
        };
        const createPluginMethodWrapper = (prop) => {
          let remove;
          const wrapper = (...args) => {
            const p = loadPluginImplementation().then((impl) => {
              const fn = createPluginMethod(impl, prop);
              if (fn) {
                const p2 = fn(...args);
                remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                return p2;
              } else {
                throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, exports.ExceptionCode.Unimplemented);
              }
            });
            if (prop === "addListener") {
              p.remove = async () => remove();
            }
            return p;
          };
          wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
          Object.defineProperty(wrapper, "name", {
            value: prop,
            writable: false,
            configurable: false
          });
          return wrapper;
        };
        const addListener = createPluginMethodWrapper("addListener");
        const removeListener = createPluginMethodWrapper("removeListener");
        const addListenerNative = (eventName, callback) => {
          const call = addListener({ eventName }, callback);
          const remove = async () => {
            const callbackId = await call;
            removeListener({
              eventName,
              callbackId
            }, callback);
          };
          const p = new Promise((resolve) => call.then(() => resolve({ remove })));
          p.remove = async () => {
            console.warn(`Using addListener() without 'await' is deprecated.`);
            await remove();
          };
          return p;
        };
        const proxy = new Proxy({}, {
          get(_, prop) {
            switch (prop) {
              // https://github.com/facebook/react/issues/20030
              case "$$typeof":
                return void 0;
              case "toJSON":
                return () => ({});
              case "addListener":
                return pluginHeader ? addListenerNative : addListener;
              case "removeListener":
                return removeListener;
              default:
                return createPluginMethodWrapper(prop);
            }
          }
        });
        Plugins[pluginName] = proxy;
        registeredPlugins.set(pluginName, {
          name: pluginName,
          proxy,
          platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
        });
        return proxy;
      };
      if (!cap.convertFileSrc) {
        cap.convertFileSrc = (filePath) => filePath;
      }
      cap.getPlatform = getPlatform;
      cap.handleError = handleError;
      cap.isNativePlatform = isNativePlatform2;
      cap.isPluginAvailable = isPluginAvailable;
      cap.registerPlugin = registerPlugin2;
      cap.Exception = CapacitorException;
      cap.DEBUG = !!cap.DEBUG;
      cap.isLoggingEnabled = !!cap.isLoggingEnabled;
      return cap;
    };
    var initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
    var Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
    var registerPlugin = Capacitor.registerPlugin;
    var WebPlugin = class {
      constructor() {
        this.listeners = {};
        this.retainedEventArguments = {};
        this.windowListeners = {};
      }
      addListener(eventName, listenerFunc) {
        let firstListener = false;
        const listeners = this.listeners[eventName];
        if (!listeners) {
          this.listeners[eventName] = [];
          firstListener = true;
        }
        this.listeners[eventName].push(listenerFunc);
        const windowListener = this.windowListeners[eventName];
        if (windowListener && !windowListener.registered) {
          this.addWindowListener(windowListener);
        }
        if (firstListener) {
          this.sendRetainedArgumentsForEvent(eventName);
        }
        const remove = async () => this.removeListener(eventName, listenerFunc);
        const p = Promise.resolve({ remove });
        return p;
      }
      async removeAllListeners() {
        this.listeners = {};
        for (const listener in this.windowListeners) {
          this.removeWindowListener(this.windowListeners[listener]);
        }
        this.windowListeners = {};
      }
      notifyListeners(eventName, data, retainUntilConsumed) {
        const listeners = this.listeners[eventName];
        if (!listeners) {
          if (retainUntilConsumed) {
            let args = this.retainedEventArguments[eventName];
            if (!args) {
              args = [];
            }
            args.push(data);
            this.retainedEventArguments[eventName] = args;
          }
          return;
        }
        listeners.forEach((listener) => listener(data));
      }
      hasListeners(eventName) {
        var _a;
        return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
      }
      registerWindowListener(windowEventName, pluginEventName) {
        this.windowListeners[pluginEventName] = {
          registered: false,
          windowEventName,
          pluginEventName,
          handler: (event) => {
            this.notifyListeners(pluginEventName, event);
          }
        };
      }
      unimplemented(msg = "not implemented") {
        return new Capacitor.Exception(msg, exports.ExceptionCode.Unimplemented);
      }
      unavailable(msg = "not available") {
        return new Capacitor.Exception(msg, exports.ExceptionCode.Unavailable);
      }
      async removeListener(eventName, listenerFunc) {
        const listeners = this.listeners[eventName];
        if (!listeners) {
          return;
        }
        const index = listeners.indexOf(listenerFunc);
        this.listeners[eventName].splice(index, 1);
        if (!this.listeners[eventName].length) {
          this.removeWindowListener(this.windowListeners[eventName]);
        }
      }
      addWindowListener(handle) {
        window.addEventListener(handle.windowEventName, handle.handler);
        handle.registered = true;
      }
      removeWindowListener(handle) {
        if (!handle) {
          return;
        }
        window.removeEventListener(handle.windowEventName, handle.handler);
        handle.registered = false;
      }
      sendRetainedArgumentsForEvent(eventName) {
        const args = this.retainedEventArguments[eventName];
        if (!args) {
          return;
        }
        delete this.retainedEventArguments[eventName];
        args.forEach((arg) => {
          this.notifyListeners(eventName, arg);
        });
      }
    };
    var WebView = /* @__PURE__ */ registerPlugin("WebView");
    var encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
    var decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
    var CapacitorCookiesPluginWeb = class extends WebPlugin {
      async getCookies() {
        const cookies = document.cookie;
        const cookieMap = {};
        cookies.split(";").forEach((cookie) => {
          if (cookie.length <= 0)
            return;
          let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
          key = decode(key).trim();
          value = decode(value).trim();
          cookieMap[key] = value;
        });
        return cookieMap;
      }
      async setCookie(options) {
        try {
          const encodedKey = encode(options.key);
          const encodedValue = encode(options.value);
          const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
          const path = (options.path || "/").replace("path=", "");
          const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
          document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
        } catch (error) {
          return Promise.reject(error);
        }
      }
      async deleteCookie(options) {
        try {
          document.cookie = `${options.key}=; Max-Age=0`;
        } catch (error) {
          return Promise.reject(error);
        }
      }
      async clearCookies() {
        try {
          const cookies = document.cookie.split(";") || [];
          for (const cookie of cookies) {
            document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
          }
        } catch (error) {
          return Promise.reject(error);
        }
      }
      async clearAllCookies() {
        try {
          await this.clearCookies();
        } catch (error) {
          return Promise.reject(error);
        }
      }
    };
    var CapacitorCookies = registerPlugin("CapacitorCookies", {
      web: () => new CapacitorCookiesPluginWeb()
    });
    var readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result;
        resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
    var normalizeHttpHeaders = (headers = {}) => {
      const originalKeys = Object.keys(headers);
      const loweredKeys = Object.keys(headers).map((k2) => k2.toLocaleLowerCase());
      const normalized = loweredKeys.reduce((acc, key, index) => {
        acc[key] = headers[originalKeys[index]];
        return acc;
      }, {});
      return normalized;
    };
    var buildUrlParams = (params, shouldEncode = true) => {
      if (!params)
        return null;
      const output = Object.entries(params).reduce((accumulator, entry) => {
        const [key, value] = entry;
        let encodedValue;
        let item;
        if (Array.isArray(value)) {
          item = "";
          value.forEach((str) => {
            encodedValue = shouldEncode ? encodeURIComponent(str) : str;
            item += `${key}=${encodedValue}&`;
          });
          item.slice(0, -1);
        } else {
          encodedValue = shouldEncode ? encodeURIComponent(value) : value;
          item = `${key}=${encodedValue}`;
        }
        return `${accumulator}&${item}`;
      }, "");
      return output.substr(1);
    };
    var buildRequestInit = (options, extra = {}) => {
      const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
      const headers = normalizeHttpHeaders(options.headers);
      const type = headers["content-type"] || "";
      if (typeof options.data === "string") {
        output.body = options.data;
      } else if (type.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(options.data || {})) {
          params.set(key, value);
        }
        output.body = params.toString();
      } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
        const form = new FormData();
        if (options.data instanceof FormData) {
          options.data.forEach((value, key) => {
            form.append(key, value);
          });
        } else {
          for (const key of Object.keys(options.data)) {
            form.append(key, options.data[key]);
          }
        }
        output.body = form;
        const headers2 = new Headers(output.headers);
        headers2.delete("content-type");
        output.headers = headers2;
      } else if (type.includes("application/json") || typeof options.data === "object") {
        output.body = JSON.stringify(options.data);
      }
      return output;
    };
    var CapacitorHttpPluginWeb = class extends WebPlugin {
      /**
       * Perform an Http request given a set of options
       * @param options Options to build the HTTP request
       */
      async request(options) {
        const requestInit = buildRequestInit(options, options.webFetchExtra);
        const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
        const url = urlParams ? `${options.url}?${urlParams}` : options.url;
        const response = await fetch(url, requestInit);
        const contentType = response.headers.get("content-type") || "";
        let { responseType = "text" } = response.ok ? options : {};
        if (contentType.includes("application/json")) {
          responseType = "json";
        }
        let data;
        let blob;
        switch (responseType) {
          case "arraybuffer":
          case "blob":
            blob = await response.blob();
            data = await readBlobAsBase64(blob);
            break;
          case "json":
            data = await response.json();
            break;
          case "document":
          case "text":
          default:
            data = await response.text();
        }
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          data,
          headers,
          status: response.status,
          url: response.url
        };
      }
      /**
       * Perform an Http GET request given a set of options
       * @param options Options to build the HTTP request
       */
      async get(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
      }
      /**
       * Perform an Http POST request given a set of options
       * @param options Options to build the HTTP request
       */
      async post(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
      }
      /**
       * Perform an Http PUT request given a set of options
       * @param options Options to build the HTTP request
       */
      async put(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
      }
      /**
       * Perform an Http PATCH request given a set of options
       * @param options Options to build the HTTP request
       */
      async patch(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
      }
      /**
       * Perform an Http DELETE request given a set of options
       * @param options Options to build the HTTP request
       */
      async delete(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
      }
    };
    var CapacitorHttp = registerPlugin("CapacitorHttp", {
      web: () => new CapacitorHttpPluginWeb()
    });
    exports.SystemBarsStyle = void 0;
    (function(SystemBarsStyle) {
      SystemBarsStyle["Dark"] = "DARK";
      SystemBarsStyle["Light"] = "LIGHT";
      SystemBarsStyle["Default"] = "DEFAULT";
    })(exports.SystemBarsStyle || (exports.SystemBarsStyle = {}));
    exports.SystemBarType = void 0;
    (function(SystemBarType) {
      SystemBarType["StatusBar"] = "StatusBar";
      SystemBarType["NavigationBar"] = "NavigationBar";
    })(exports.SystemBarType || (exports.SystemBarType = {}));
    var SystemBarsPluginWeb = class extends WebPlugin {
      async setStyle() {
        this.unavailable("not available for web");
      }
      async setAnimation() {
        this.unavailable("not available for web");
      }
      async show() {
        this.unavailable("not available for web");
      }
      async hide() {
        this.unavailable("not available for web");
      }
    };
    var SystemBars = registerPlugin("SystemBars", {
      web: () => new SystemBarsPluginWeb()
    });
    exports.Capacitor = Capacitor;
    exports.CapacitorCookies = CapacitorCookies;
    exports.CapacitorException = CapacitorException;
    exports.CapacitorHttp = CapacitorHttp;
    exports.SystemBars = SystemBars;
    exports.WebPlugin = WebPlugin;
    exports.WebView = WebView;
    exports.buildRequestInit = buildRequestInit;
    exports.registerPlugin = registerPlugin;
  }
});

// node_modules/.pnpm/capacitor-secure-storage-plugin@0.13.0_@capacitor+core@8.5.0/node_modules/capacitor-secure-storage-plugin/dist/plugin.cjs.js
var require_plugin_cjs = __commonJS({
  "node_modules/.pnpm/capacitor-secure-storage-plugin@0.13.0_@capacitor+core@8.5.0/node_modules/capacitor-secure-storage-plugin/dist/plugin.cjs.js"(exports) {
    "use strict";
    var core = require_index_cjs();
    var SecureStoragePlugin = core.registerPlugin("SecureStoragePlugin", {
      web: () => Promise.resolve().then(function() {
        return web;
      }).then((m) => new m.SecureStoragePluginWeb())
    });
    var SecureStoragePluginWeb = class extends core.WebPlugin {
      constructor() {
        super(...arguments);
        this.PREFIX = "cap_sec_";
        this.addPrefix = (key) => this.PREFIX + key;
        this.removePrefix = (key) => key.replace(this.PREFIX, "");
      }
      get(options) {
        const value = localStorage.getItem(this.addPrefix(options.key));
        return value !== null ? Promise.resolve({
          value: atob(value)
        }) : Promise.reject("Item with given key does not exist");
      }
      set(options) {
        localStorage.setItem(this.addPrefix(options.key), btoa(options.value));
        return Promise.resolve({ value: true });
      }
      remove(options) {
        if (localStorage.getItem(this.addPrefix(options.key))) {
          localStorage.removeItem(this.addPrefix(options.key));
          return Promise.resolve({ value: true });
        } else {
          return Promise.reject("Item with given key does not exist");
        }
      }
      clear() {
        for (const key in localStorage) {
          if (key.indexOf(this.PREFIX) === 0) {
            localStorage.removeItem(key);
          }
        }
        return Promise.resolve({ value: true });
      }
      keys() {
        const keys = Object.keys(localStorage).filter((k2) => k2.indexOf(this.PREFIX) === 0).map(this.removePrefix);
        return Promise.resolve({ value: keys });
      }
      getPlatform() {
        return Promise.resolve({ value: "web" });
      }
    };
    var web = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      SecureStoragePluginWeb
    });
    exports.SecureStoragePlugin = SecureStoragePlugin;
  }
});

// node_modules/.pnpm/idb@8.0.3/node_modules/idb/build/index.js
var build_exports = {};
__export(build_exports, {
  deleteDB: () => deleteDB,
  openDB: () => openDB,
  unwrap: () => unwrap,
  wrap: () => wrap
});
function getIdbProxyableTypes() {
  return idbProxyableTypes || (idbProxyableTypes = [
    IDBDatabase,
    IDBObjectStore,
    IDBIndex,
    IDBCursor,
    IDBTransaction
  ]);
}
function getCursorAdvanceMethods() {
  return cursorAdvanceMethods || (cursorAdvanceMethods = [
    IDBCursor.prototype.advance,
    IDBCursor.prototype.continue,
    IDBCursor.prototype.continuePrimaryKey
  ]);
}
function promisifyRequest(request) {
  const promise = new Promise((resolve, reject) => {
    const unlisten = () => {
      request.removeEventListener("success", success);
      request.removeEventListener("error", error);
    };
    const success = () => {
      resolve(wrap(request.result));
      unlisten();
    };
    const error = () => {
      reject(request.error);
      unlisten();
    };
    request.addEventListener("success", success);
    request.addEventListener("error", error);
  });
  reverseTransformCache.set(promise, request);
  return promise;
}
function cacheDonePromiseForTransaction(tx) {
  if (transactionDoneMap.has(tx))
    return;
  const done = new Promise((resolve, reject) => {
    const unlisten = () => {
      tx.removeEventListener("complete", complete);
      tx.removeEventListener("error", error);
      tx.removeEventListener("abort", error);
    };
    const complete = () => {
      resolve();
      unlisten();
    };
    const error = () => {
      reject(tx.error || new DOMException("AbortError", "AbortError"));
      unlisten();
    };
    tx.addEventListener("complete", complete);
    tx.addEventListener("error", error);
    tx.addEventListener("abort", error);
  });
  transactionDoneMap.set(tx, done);
}
function replaceTraps(callback) {
  idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
  if (getCursorAdvanceMethods().includes(func)) {
    return function(...args) {
      func.apply(unwrap(this), args);
      return wrap(this.request);
    };
  }
  return function(...args) {
    return wrap(func.apply(unwrap(this), args));
  };
}
function transformCachableValue(value) {
  if (typeof value === "function")
    return wrapFunction(value);
  if (value instanceof IDBTransaction)
    cacheDonePromiseForTransaction(value);
  if (instanceOfAny(value, getIdbProxyableTypes()))
    return new Proxy(value, idbProxyTraps);
  return value;
}
function wrap(value) {
  if (value instanceof IDBRequest)
    return promisifyRequest(value);
  if (transformCache.has(value))
    return transformCache.get(value);
  const newValue = transformCachableValue(value);
  if (newValue !== value) {
    transformCache.set(value, newValue);
    reverseTransformCache.set(newValue, value);
  }
  return newValue;
}
function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
  const request = indexedDB.open(name, version);
  const openPromise = wrap(request);
  if (upgrade) {
    request.addEventListener("upgradeneeded", (event) => {
      upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
    });
  }
  if (blocked) {
    request.addEventListener("blocked", (event) => blocked(
      // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
      event.oldVersion,
      event.newVersion,
      event
    ));
  }
  openPromise.then((db) => {
    if (terminated)
      db.addEventListener("close", () => terminated());
    if (blocking) {
      db.addEventListener("versionchange", (event) => blocking(event.oldVersion, event.newVersion, event));
    }
  }).catch(() => {
  });
  return openPromise;
}
function deleteDB(name, { blocked } = {}) {
  const request = indexedDB.deleteDatabase(name);
  if (blocked) {
    request.addEventListener("blocked", (event) => blocked(
      // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
      event.oldVersion,
      event
    ));
  }
  return wrap(request).then(() => void 0);
}
function getMethod(target, prop) {
  if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
    return;
  }
  if (cachedMethods.get(prop))
    return cachedMethods.get(prop);
  const targetFuncName = prop.replace(/FromIndex$/, "");
  const useIndex = prop !== targetFuncName;
  const isWrite = writeMethods.includes(targetFuncName);
  if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
  ) {
    return;
  }
  const method = async function(storeName, ...args) {
    const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
    let target2 = tx.store;
    if (useIndex)
      target2 = target2.index(args.shift());
    return (await Promise.all([
      target2[targetFuncName](...args),
      isWrite && tx.done
    ]))[0];
  };
  cachedMethods.set(prop, method);
  return method;
}
async function* iterate(...args) {
  let cursor = this;
  if (!(cursor instanceof IDBCursor)) {
    cursor = await cursor.openCursor(...args);
  }
  if (!cursor)
    return;
  cursor = cursor;
  const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
  ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
  reverseTransformCache.set(proxiedCursor, unwrap(cursor));
  while (cursor) {
    yield proxiedCursor;
    cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
    advanceResults.delete(proxiedCursor);
  }
}
function isIteratorProp(target, prop) {
  return prop === Symbol.asyncIterator && instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor]) || prop === "iterate" && instanceOfAny(target, [IDBIndex, IDBObjectStore]);
}
var instanceOfAny, idbProxyableTypes, cursorAdvanceMethods, transactionDoneMap, transformCache, reverseTransformCache, idbProxyTraps, unwrap, readMethods, writeMethods, cachedMethods, advanceMethodProps, methodMap, advanceResults, ittrProxiedCursorToOriginalProxy, cursorIteratorTraps;
var init_build = __esm({
  "node_modules/.pnpm/idb@8.0.3/node_modules/idb/build/index.js"() {
    instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
    transactionDoneMap = /* @__PURE__ */ new WeakMap();
    transformCache = /* @__PURE__ */ new WeakMap();
    reverseTransformCache = /* @__PURE__ */ new WeakMap();
    idbProxyTraps = {
      get(target, prop, receiver) {
        if (target instanceof IDBTransaction) {
          if (prop === "done")
            return transactionDoneMap.get(target);
          if (prop === "store") {
            return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
          }
        }
        return wrap(target[prop]);
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
      has(target, prop) {
        if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
          return true;
        }
        return prop in target;
      }
    };
    unwrap = (value) => reverseTransformCache.get(value);
    readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
    writeMethods = ["put", "add", "delete", "clear"];
    cachedMethods = /* @__PURE__ */ new Map();
    replaceTraps((oldTraps) => ({
      ...oldTraps,
      get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
      has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
    }));
    advanceMethodProps = ["continue", "continuePrimaryKey", "advance"];
    methodMap = {};
    advanceResults = /* @__PURE__ */ new WeakMap();
    ittrProxiedCursorToOriginalProxy = /* @__PURE__ */ new WeakMap();
    cursorIteratorTraps = {
      get(target, prop) {
        if (!advanceMethodProps.includes(prop))
          return target[prop];
        let cachedFunc = methodMap[prop];
        if (!cachedFunc) {
          cachedFunc = methodMap[prop] = function(...args) {
            advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
          };
        }
        return cachedFunc;
      }
    };
    replaceTraps((oldTraps) => ({
      ...oldTraps,
      get(target, prop, receiver) {
        if (isIteratorProp(target, prop))
          return iterate;
        return oldTraps.get(target, prop, receiver);
      },
      has(target, prop) {
        return isIteratorProp(target, prop) || oldTraps.has(target, prop);
      }
    }));
  }
});

// src/lib/wallet/proofsDb.ts
var proofsDb_exports = {};
__export(proofsDb_exports, {
  addProofs: () => addProofs,
  clearOrphaned: () => clearOrphaned,
  clearProofs: () => clearProofs,
  deleteProofDB: () => deleteProofDB,
  getAllProofs: () => getAllProofs,
  getBalanceByMint: () => getBalanceByMint,
  getOrphanedProofs: () => getOrphanedProofs,
  getProofById: () => getProofById,
  getProofCount: () => getProofCount,
  getProofsByMint: () => getProofsByMint,
  getTotalBalance: () => getTotalBalance,
  getUnspentProofs: () => getUnspentProofs,
  getUnspentProofsByMint: () => getUnspentProofsByMint,
  markOrphaned: () => markOrphaned,
  markSpent: () => markSpent,
  migrateProofs: () => migrateProofs,
  needsMigration: () => needsMigration,
  removeProofs: () => removeProofs,
  resetProofDB: () => resetProofDB,
  updateProofMintUrl: () => updateProofMintUrl
});
async function getDB() {
  if (dbInstance) return dbInstance;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store2 = db.createObjectStore(STORE_NAME, { keyPath: "local_id" });
          store2.createIndex("mint_url", "mint_url");
          store2.createIndex("keyset_id", "keyset_id");
          store2.createIndex("spent", "spent");
          store2.createIndex("stored_at", "stored_at");
          store2.createIndex("amount", "amount");
        }
      }
    });
  }
  dbInstance = await dbPromise;
  return dbInstance;
}
function resetProofDB() {
  dbInstance = null;
  dbPromise = null;
}
async function deleteProofDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  dbPromise = null;
  try {
    const { deleteDB: deleteDB2 } = await Promise.resolve().then(() => (init_build(), build_exports));
    await deleteDB2(DB_NAME);
  } catch {
  }
}
function makeLocalId(proof) {
  const secretStart = proof.secret.substring(0, 8);
  const secretEnd = proof.secret.length > 8 ? proof.secret.substring(proof.secret.length - 8) : secretStart;
  return `${proof.id}:${secretStart}:${secretEnd}`;
}
async function addProofs(newProofs, mintUrl, keysetId) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  for (const proof of newProofs) {
    const stored = {
      ...proof,
      local_id: makeLocalId(proof),
      mint_url: mintUrl,
      keyset_id: keysetId,
      stored_at: Date.now(),
      spent: false
    };
    await tx.store.put(stored);
  }
  await tx.done;
}
async function getAllProofs() {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}
async function getUnspentProofs() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter((p) => !p.spent && !p.orphaned);
}
async function getProofsByMint(mintUrl) {
  const db = await getDB();
  const idx = db.transaction(STORE_NAME, "readonly").store.index("mint_url");
  return idx.getAll(mintUrl);
}
async function getUnspentProofsByMint(mintUrl) {
  const proofs = await getProofsByMint(mintUrl);
  return proofs.filter((p) => !p.spent && !p.orphaned);
}
async function getProofById(localId) {
  const db = await getDB();
  return db.get(STORE_NAME, localId);
}
async function removeProofs(localIds) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  for (const id of localIds) {
    await tx.store.delete(id);
  }
  await tx.done;
}
async function markSpent(localIds) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  for (const id of localIds) {
    const proof = await tx.store.get(id);
    if (proof) {
      proof.spent = true;
      await tx.store.put(proof);
    }
  }
  await tx.done;
}
async function clearProofs() {
  const db = await getDB();
  await db.clear(STORE_NAME);
}
async function getProofCount() {
  const db = await getDB();
  return db.count(STORE_NAME);
}
async function getTotalBalance() {
  const unspent = await getUnspentProofs();
  return unspent.reduce((sum, p) => sum + p.amount, 0);
}
async function getBalanceByMint() {
  const unspent = await getUnspentProofs();
  const breakdown = {};
  for (const p of unspent) {
    breakdown[p.mint_url] = (breakdown[p.mint_url] ?? 0) + p.amount;
  }
  return breakdown;
}
async function updateProofMintUrl(localId, newMintUrl) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const stored = await tx.store.get(localId);
  if (stored) {
    stored.mint_url = newMintUrl;
    await tx.store.put(stored);
  }
  await tx.done;
}
async function markOrphaned(localId) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const stored = await tx.store.get(localId);
  if (stored) {
    stored.orphaned = true;
    await tx.store.put(stored);
  }
  await tx.done;
}
async function migrateProofs(knownMints, dryRun = false) {
  const result = {
    unchanged: 0,
    retagged: 0,
    orphaned: 0,
    total: 0
  };
  const keysetToMint = /* @__PURE__ */ new Map();
  for (const mint of knownMints) {
    for (const ksId of mint.keysetIds) {
      if (keysetToMint.has(ksId)) {
        keysetToMint.set(ksId, "__AMBIGUOUS__");
      } else {
        keysetToMint.set(ksId, mint.url);
      }
    }
  }
  const db = await getDB();
  const allProofs = await db.getAll(STORE_NAME);
  result.total = allProofs.length;
  for (const proof of allProofs) {
    if (proof.spent) {
      result.unchanged++;
      continue;
    }
    const matchedMint = keysetToMint.get(proof.keyset_id);
    if (!matchedMint) {
      result.orphaned++;
      if (!dryRun) {
        await markOrphaned(proof.local_id);
        console.warn(
          `[proofsDb] F-072: Orphaned proof ${proof.local_id} \u2014 keyset ${proof.keyset_id} not found in any known mint.`
        );
      }
    } else if (matchedMint === "__AMBIGUOUS__") {
      result.orphaned++;
      if (!dryRun) {
        await markOrphaned(proof.local_id);
        console.warn(
          `[proofsDb] F-072: Ambiguous proof ${proof.local_id} \u2014 keyset ${proof.keyset_id} found in multiple mints. Flagged as orphaned.`
        );
      }
    } else if (matchedMint !== proof.mint_url) {
      result.retagged++;
      if (!dryRun) {
        await updateProofMintUrl(proof.local_id, matchedMint);
        console.info(
          `[proofsDb] F-072: Re-tagged proof ${proof.local_id}: ${proof.mint_url} \u2192 ${matchedMint} (keyset match)`
        );
      }
    } else {
      result.unchanged++;
    }
  }
  return result;
}
async function getOrphanedProofs() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter((p) => p.orphaned === true && !p.spent);
}
async function clearOrphaned(localId) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const stored = await tx.store.get(localId);
  if (stored) {
    stored.orphaned = false;
    await tx.store.put(stored);
  }
  await tx.done;
}
async function needsMigration(knownMints) {
  const dryRunResult = await migrateProofs(knownMints, true);
  return dryRunResult.retagged > 0 || dryRunResult.orphaned > 0;
}
var DB_NAME, DB_VERSION, STORE_NAME, dbPromise, dbInstance;
var init_proofsDb = __esm({
  "src/lib/wallet/proofsDb.ts"() {
    init_build();
    DB_NAME = "lnw-cash-proofs";
    DB_VERSION = 1;
    STORE_NAME = "proofs";
    dbPromise = null;
    dbInstance = null;
  }
});

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/errors.js
var messages = {
  AbortError: "A request was aborted, for example through a call to IDBTransaction.abort.",
  ConstraintError: "A mutation operation in the transaction failed because a constraint was not satisfied. For example, an object such as an object store or index already exists and a request attempted to create a new one.",
  DataCloneError: "The data being stored could not be cloned by the internal structured cloning algorithm.",
  DataError: "Data provided to an operation does not meet requirements.",
  InvalidAccessError: "An invalid operation was performed on an object. For example transaction creation attempt was made, but an empty scope was provided.",
  InvalidStateError: "An operation was called on an object on which it is not allowed or at a time when it is not allowed. Also occurs if a request is made on a source object that has been deleted or removed. Use TransactionInactiveError or ReadOnlyError when possible, as they are more specific variations of InvalidStateError.",
  NotFoundError: "The operation failed because the requested database object could not be found. For example, an object store did not exist but was being opened.",
  ReadOnlyError: 'The mutating operation was attempted in a "readonly" transaction.',
  TransactionInactiveError: "A request was placed against a transaction which is currently not active, or which is finished.",
  SyntaxError: "The keypath argument contains an invalid key path",
  VersionError: "An attempt was made to open a database using a lower version than the existing version."
};
var setErrorCode = (error, value) => {
  Object.defineProperty(error, "code", {
    value,
    writable: false,
    enumerable: true,
    configurable: false
  });
};
var AbortError = class extends DOMException {
  constructor(message = messages.AbortError) {
    super(message, "AbortError");
  }
};
var ConstraintError = class extends DOMException {
  constructor(message = messages.ConstraintError) {
    super(message, "ConstraintError");
  }
};
var DataError = class extends DOMException {
  constructor(message = messages.DataError) {
    super(message, "DataError");
    setErrorCode(this, 0);
  }
};
var InvalidAccessError = class extends DOMException {
  constructor(message = messages.InvalidAccessError) {
    super(message, "InvalidAccessError");
  }
};
var InvalidStateError = class extends DOMException {
  constructor(message = messages.InvalidStateError) {
    super(message, "InvalidStateError");
    setErrorCode(this, 11);
  }
};
var NotFoundError = class extends DOMException {
  constructor(message = messages.NotFoundError) {
    super(message, "NotFoundError");
  }
};
var ReadOnlyError = class extends DOMException {
  constructor(message = messages.ReadOnlyError) {
    super(message, "ReadOnlyError");
  }
};
var SyntaxError2 = class extends DOMException {
  constructor(message = messages.VersionError) {
    super(message, "SyntaxError");
    setErrorCode(this, 12);
  }
};
var TransactionInactiveError = class extends DOMException {
  constructor(message = messages.TransactionInactiveError) {
    super(message, "TransactionInactiveError");
    setErrorCode(this, 0);
  }
};
var VersionError = class extends DOMException {
  constructor(message = messages.VersionError) {
    super(message, "VersionError");
  }
};

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/isSharedArrayBuffer.js
function isSharedArrayBuffer(input) {
  return typeof SharedArrayBuffer !== "undefined" && input instanceof SharedArrayBuffer;
}

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/valueToKeyWithoutThrowing.js
var INVALID_TYPE = /* @__PURE__ */ Symbol("INVALID_TYPE");
var INVALID_VALUE = /* @__PURE__ */ Symbol("INVALID_VALUE");
var valueToKeyWithoutThrowing = (input, seen) => {
  if (typeof input === "number") {
    if (isNaN(input)) {
      return INVALID_VALUE;
    }
    return input;
  } else if (Object.prototype.toString.call(input) === "[object Date]") {
    const ms = input.valueOf();
    if (isNaN(ms)) {
      return INVALID_VALUE;
    }
    return new Date(ms);
  } else if (typeof input === "string") {
    return input;
  } else if (
    // https://w3c.github.io/IndexedDB/#ref-for-dfn-buffer-source-type
    input instanceof ArrayBuffer || isSharedArrayBuffer(input) || typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(input)
  ) {
    if ("detached" in input ? input.detached : input.byteLength === 0) {
      return INVALID_VALUE;
    }
    let arrayBuffer;
    let offset = 0;
    let length = 0;
    if (input instanceof ArrayBuffer || isSharedArrayBuffer(input)) {
      arrayBuffer = input;
      length = input.byteLength;
    } else {
      arrayBuffer = input.buffer;
      offset = input.byteOffset;
      length = input.byteLength;
    }
    return arrayBuffer.slice(offset, offset + length);
  } else if (Array.isArray(input)) {
    if (seen === void 0) {
      seen = /* @__PURE__ */ new Set();
    } else if (seen.has(input)) {
      return INVALID_VALUE;
    }
    seen.add(input);
    let hasInvalid = false;
    const keys = Array.from({
      length: input.length
    }, (_, i) => {
      if (hasInvalid) {
        return;
      }
      const hop = Object.hasOwn(input, i);
      if (!hop) {
        hasInvalid = true;
        return;
      }
      const entry = input[i];
      const key = valueToKeyWithoutThrowing(entry, seen);
      if (key === INVALID_VALUE || key === INVALID_TYPE) {
        hasInvalid = true;
        return;
      }
      return key;
    });
    if (hasInvalid) {
      return INVALID_VALUE;
    }
    return keys;
  } else {
    return INVALID_TYPE;
  }
};
var valueToKeyWithoutThrowing_default = valueToKeyWithoutThrowing;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/valueToKey.js
var valueToKey = (input, seen) => {
  const result = valueToKeyWithoutThrowing_default(input, seen);
  if (result === INVALID_VALUE || result === INVALID_TYPE) {
    throw new DataError();
  }
  return result;
};
var valueToKey_default = valueToKey;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/cmp.js
var getType = (x) => {
  if (typeof x === "number") {
    return "Number";
  }
  if (Object.prototype.toString.call(x) === "[object Date]") {
    return "Date";
  }
  if (Array.isArray(x)) {
    return "Array";
  }
  if (typeof x === "string") {
    return "String";
  }
  if (x instanceof ArrayBuffer) {
    return "Binary";
  }
  throw new DataError();
};
var cmp = (first, second) => {
  if (second === void 0) {
    throw new TypeError();
  }
  first = valueToKey_default(first);
  second = valueToKey_default(second);
  const t1 = getType(first);
  const t2 = getType(second);
  if (t1 !== t2) {
    if (t1 === "Array") {
      return 1;
    }
    if (t1 === "Binary" && (t2 === "String" || t2 === "Date" || t2 === "Number")) {
      return 1;
    }
    if (t1 === "String" && (t2 === "Date" || t2 === "Number")) {
      return 1;
    }
    if (t1 === "Date" && t2 === "Number") {
      return 1;
    }
    return -1;
  }
  if (t1 === "Binary") {
    first = new Uint8Array(first);
    second = new Uint8Array(second);
  }
  if (t1 === "Array" || t1 === "Binary") {
    const length = Math.min(first.length, second.length);
    for (let i = 0; i < length; i++) {
      const result = cmp(first[i], second[i]);
      if (result !== 0) {
        return result;
      }
    }
    if (first.length > second.length) {
      return 1;
    }
    if (first.length < second.length) {
      return -1;
    }
    return 0;
  }
  if (t1 === "Date") {
    if (first.getTime() === second.getTime()) {
      return 0;
    }
  } else {
    if (first === second) {
      return 0;
    }
  }
  return first > second ? 1 : -1;
};
var cmp_default = cmp;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBKeyRange.js
var FDBKeyRange = class _FDBKeyRange {
  static only(value) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    value = valueToKey_default(value);
    return new _FDBKeyRange(value, value, false, false);
  }
  static lowerBound(lower, open = false) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    lower = valueToKey_default(lower);
    return new _FDBKeyRange(lower, void 0, open, true);
  }
  static upperBound(upper, open = false) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    upper = valueToKey_default(upper);
    return new _FDBKeyRange(void 0, upper, true, open);
  }
  static bound(lower, upper, lowerOpen = false, upperOpen = false) {
    if (arguments.length < 2) {
      throw new TypeError();
    }
    const cmpResult = cmp_default(lower, upper);
    if (cmpResult === 1 || cmpResult === 0 && (lowerOpen || upperOpen)) {
      throw new DataError();
    }
    lower = valueToKey_default(lower);
    upper = valueToKey_default(upper);
    return new _FDBKeyRange(lower, upper, lowerOpen, upperOpen);
  }
  constructor(lower, upper, lowerOpen, upperOpen) {
    this.lower = lower;
    this.upper = upper;
    this.lowerOpen = lowerOpen;
    this.upperOpen = upperOpen;
  }
  // https://w3c.github.io/IndexedDB/#dom-idbkeyrange-includes
  includes(key) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    key = valueToKey_default(key);
    if (this.lower !== void 0) {
      const cmpResult = cmp_default(this.lower, key);
      if (cmpResult === 1 || cmpResult === 0 && this.lowerOpen) {
        return false;
      }
    }
    if (this.upper !== void 0) {
      const cmpResult = cmp_default(this.upper, key);
      if (cmpResult === -1 || cmpResult === 0 && this.upperOpen) {
        return false;
      }
    }
    return true;
  }
  get [Symbol.toStringTag]() {
    return "IDBKeyRange";
  }
};
var FDBKeyRange_default = FDBKeyRange;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/extractKey.js
var extractKey = (keyPath, value) => {
  if (Array.isArray(keyPath)) {
    const result = [];
    for (let item of keyPath) {
      if (item !== void 0 && item !== null && typeof item !== "string" && item.toString) {
        item = item.toString();
      }
      const key = extractKey(item, value).key;
      result.push(valueToKey_default(key));
    }
    return {
      type: "found",
      key: result
    };
  }
  if (keyPath === "") {
    return {
      type: "found",
      key: value
    };
  }
  let remainingKeyPath = keyPath;
  let object = value;
  while (remainingKeyPath !== null) {
    let identifier;
    const i = remainingKeyPath.indexOf(".");
    if (i >= 0) {
      identifier = remainingKeyPath.slice(0, i);
      remainingKeyPath = remainingKeyPath.slice(i + 1);
    } else {
      identifier = remainingKeyPath;
      remainingKeyPath = null;
    }
    const isSpecialIdentifier = identifier === "length" && (typeof object === "string" || Array.isArray(object)) || (identifier === "size" || identifier === "type") && typeof Blob !== "undefined" && object instanceof Blob || (identifier === "name" || identifier === "lastModified") && typeof File !== "undefined" && object instanceof File;
    if (!isSpecialIdentifier && (typeof object !== "object" || object === null || !Object.hasOwn(object, identifier))) {
      return {
        type: "notFound"
      };
    }
    object = object[identifier];
  }
  return {
    type: "found",
    key: object
  };
};
var extractKey_default = extractKey;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/cloneValueForInsertion.js
function cloneValueForInsertion(value, transaction) {
  if (transaction._state !== "active") {
    throw new Error("Assert: transaction state is active");
  }
  transaction._state = "inactive";
  try {
    return structuredClone(value);
  } finally {
    transaction._state = "active";
  }
}

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBCursor.js
var getEffectiveObjectStore = (cursor) => {
  if (cursor.source instanceof FDBObjectStore_default) {
    return cursor.source;
  }
  return cursor.source.objectStore;
};
var makeKeyRange = (range, lowers, uppers) => {
  let lower = range !== void 0 ? range.lower : void 0;
  let upper = range !== void 0 ? range.upper : void 0;
  for (const lowerTemp of lowers) {
    if (lowerTemp === void 0) {
      continue;
    }
    if (lower === void 0 || cmp_default(lower, lowerTemp) === 1) {
      lower = lowerTemp;
    }
  }
  for (const upperTemp of uppers) {
    if (upperTemp === void 0) {
      continue;
    }
    if (upper === void 0 || cmp_default(upper, upperTemp) === -1) {
      upper = upperTemp;
    }
  }
  if (lower !== void 0 && upper !== void 0) {
    return FDBKeyRange_default.bound(lower, upper);
  }
  if (lower !== void 0) {
    return FDBKeyRange_default.lowerBound(lower);
  }
  if (upper !== void 0) {
    return FDBKeyRange_default.upperBound(upper);
  }
};
var FDBCursor = class {
  _gotValue = false;
  _position = void 0;
  // Key of previously returned record
  _objectStorePosition = void 0;
  _keyOnly = false;
  _key = void 0;
  _primaryKey = void 0;
  constructor(source, range, direction = "next", request, keyOnly = false) {
    this._range = range;
    this._source = source;
    this._direction = direction;
    this._request = request;
    this._keyOnly = keyOnly;
  }
  // Read only properties
  get source() {
    return this._source;
  }
  set source(val) {
  }
  get request() {
    return this._request;
  }
  set request(val) {
  }
  get direction() {
    return this._direction;
  }
  set direction(val) {
  }
  get key() {
    return this._key;
  }
  set key(val) {
  }
  get primaryKey() {
    return this._primaryKey;
  }
  set primaryKey(val) {
  }
  // https://w3c.github.io/IndexedDB/#iterate-a-cursor
  _iterate(key, primaryKey) {
    const sourceIsObjectStore = this.source instanceof FDBObjectStore_default;
    const records = this.source instanceof FDBObjectStore_default ? this.source._rawObjectStore.records : this.source._rawIndex.records;
    let foundRecord;
    if (this.direction === "next") {
      const range = makeKeyRange(this._range, [key, this._position], []);
      for (const record of records.values(range)) {
        const cmpResultKey = key !== void 0 ? cmp_default(record.key, key) : void 0;
        const cmpResultPosition = this._position !== void 0 ? cmp_default(record.key, this._position) : void 0;
        if (key !== void 0) {
          if (cmpResultKey === -1) {
            continue;
          }
        }
        if (primaryKey !== void 0) {
          if (cmpResultKey === -1) {
            continue;
          }
          const cmpResultPrimaryKey = cmp_default(record.value, primaryKey);
          if (cmpResultKey === 0 && cmpResultPrimaryKey === -1) {
            continue;
          }
        }
        if (this._position !== void 0 && sourceIsObjectStore) {
          if (cmpResultPosition !== 1) {
            continue;
          }
        }
        if (this._position !== void 0 && !sourceIsObjectStore) {
          if (cmpResultPosition === -1) {
            continue;
          }
          if (cmpResultPosition === 0 && cmp_default(record.value, this._objectStorePosition) !== 1) {
            continue;
          }
        }
        if (this._range !== void 0) {
          if (!this._range.includes(record.key)) {
            continue;
          }
        }
        foundRecord = record;
        break;
      }
    } else if (this.direction === "nextunique") {
      const range = makeKeyRange(this._range, [key, this._position], []);
      for (const record of records.values(range)) {
        if (key !== void 0) {
          if (cmp_default(record.key, key) === -1) {
            continue;
          }
        }
        if (this._position !== void 0) {
          if (cmp_default(record.key, this._position) !== 1) {
            continue;
          }
        }
        if (this._range !== void 0) {
          if (!this._range.includes(record.key)) {
            continue;
          }
        }
        foundRecord = record;
        break;
      }
    } else if (this.direction === "prev") {
      const range = makeKeyRange(this._range, [], [key, this._position]);
      for (const record of records.values(range, "prev")) {
        const cmpResultKey = key !== void 0 ? cmp_default(record.key, key) : void 0;
        const cmpResultPosition = this._position !== void 0 ? cmp_default(record.key, this._position) : void 0;
        if (key !== void 0) {
          if (cmpResultKey === 1) {
            continue;
          }
        }
        if (primaryKey !== void 0) {
          if (cmpResultKey === 1) {
            continue;
          }
          const cmpResultPrimaryKey = cmp_default(record.value, primaryKey);
          if (cmpResultKey === 0 && cmpResultPrimaryKey === 1) {
            continue;
          }
        }
        if (this._position !== void 0 && sourceIsObjectStore) {
          if (cmpResultPosition !== -1) {
            continue;
          }
        }
        if (this._position !== void 0 && !sourceIsObjectStore) {
          if (cmpResultPosition === 1) {
            continue;
          }
          if (cmpResultPosition === 0 && cmp_default(record.value, this._objectStorePosition) !== -1) {
            continue;
          }
        }
        if (this._range !== void 0) {
          if (!this._range.includes(record.key)) {
            continue;
          }
        }
        foundRecord = record;
        break;
      }
    } else if (this.direction === "prevunique") {
      let tempRecord;
      const range = makeKeyRange(this._range, [], [key, this._position]);
      for (const record of records.values(range, "prev")) {
        if (key !== void 0) {
          if (cmp_default(record.key, key) === 1) {
            continue;
          }
        }
        if (this._position !== void 0) {
          if (cmp_default(record.key, this._position) !== -1) {
            continue;
          }
        }
        if (this._range !== void 0) {
          if (!this._range.includes(record.key)) {
            continue;
          }
        }
        tempRecord = record;
        break;
      }
      if (tempRecord) {
        foundRecord = records.get(tempRecord.key);
      }
    }
    let result;
    if (!foundRecord) {
      this._key = void 0;
      if (!sourceIsObjectStore) {
        this._objectStorePosition = void 0;
      }
      if (!this._keyOnly && this.toString() === "[object IDBCursorWithValue]") {
        this.value = void 0;
      }
      result = null;
    } else {
      this._position = foundRecord.key;
      if (!sourceIsObjectStore) {
        this._objectStorePosition = foundRecord.value;
      }
      this._key = foundRecord.key;
      if (sourceIsObjectStore) {
        this._primaryKey = structuredClone(foundRecord.key);
        if (!this._keyOnly && this.toString() === "[object IDBCursorWithValue]") {
          this.value = structuredClone(foundRecord.value);
        }
      } else {
        this._primaryKey = structuredClone(foundRecord.value);
        if (!this._keyOnly && this.toString() === "[object IDBCursorWithValue]") {
          if (this.source instanceof FDBObjectStore_default) {
            throw new Error("This should never happen");
          }
          const value = this.source.objectStore._rawObjectStore.getValue(foundRecord.value);
          this.value = structuredClone(value);
        }
      }
      this._gotValue = true;
      result = this;
    }
    return result;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBCursor-update-IDBRequest-any-value
  update(value) {
    if (value === void 0) {
      throw new TypeError();
    }
    const effectiveObjectStore = getEffectiveObjectStore(this);
    const effectiveKey = Object.hasOwn(this.source, "_rawIndex") ? this.primaryKey : this._position;
    const transaction = effectiveObjectStore.transaction;
    if (transaction._state !== "active") {
      throw new TransactionInactiveError();
    }
    if (transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }
    if (effectiveObjectStore._rawObjectStore.deleted) {
      throw new InvalidStateError();
    }
    if (!(this.source instanceof FDBObjectStore_default) && this.source._rawIndex.deleted) {
      throw new InvalidStateError();
    }
    if (!this._gotValue || !Object.hasOwn(this, "value")) {
      throw new InvalidStateError();
    }
    const clone = cloneValueForInsertion(value, transaction);
    if (effectiveObjectStore.keyPath !== null) {
      let tempKey;
      try {
        tempKey = extractKey_default(effectiveObjectStore.keyPath, clone).key;
      } catch (err) {
      }
      if (cmp_default(tempKey, effectiveKey) !== 0) {
        throw new DataError();
      }
    }
    const record = {
      key: effectiveKey,
      value: clone
    };
    return transaction._execRequestAsync({
      operation: effectiveObjectStore._rawObjectStore.storeRecord.bind(effectiveObjectStore._rawObjectStore, record, false, transaction._rollbackLog),
      source: this
    });
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBCursor-advance-void-unsigned-long-count
  advance(count) {
    if (!Number.isInteger(count) || count <= 0) {
      throw new TypeError();
    }
    const effectiveObjectStore = getEffectiveObjectStore(this);
    const transaction = effectiveObjectStore.transaction;
    if (transaction._state !== "active") {
      throw new TransactionInactiveError();
    }
    if (effectiveObjectStore._rawObjectStore.deleted) {
      throw new InvalidStateError();
    }
    if (!(this.source instanceof FDBObjectStore_default) && this.source._rawIndex.deleted) {
      throw new InvalidStateError();
    }
    if (!this._gotValue) {
      throw new InvalidStateError();
    }
    if (this._request) {
      this._request.readyState = "pending";
    }
    transaction._execRequestAsync({
      operation: () => {
        let result;
        for (let i = 0; i < count; i++) {
          result = this._iterate();
          if (!result) {
            break;
          }
        }
        return result;
      },
      request: this._request,
      source: this.source
    });
    this._gotValue = false;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBCursor-continue-void-any-key
  continue(key) {
    const effectiveObjectStore = getEffectiveObjectStore(this);
    const transaction = effectiveObjectStore.transaction;
    if (transaction._state !== "active") {
      throw new TransactionInactiveError();
    }
    if (effectiveObjectStore._rawObjectStore.deleted) {
      throw new InvalidStateError();
    }
    if (!(this.source instanceof FDBObjectStore_default) && this.source._rawIndex.deleted) {
      throw new InvalidStateError();
    }
    if (!this._gotValue) {
      throw new InvalidStateError();
    }
    if (key !== void 0) {
      key = valueToKey_default(key);
      const cmpResult = cmp_default(key, this._position);
      if (cmpResult <= 0 && (this.direction === "next" || this.direction === "nextunique") || cmpResult >= 0 && (this.direction === "prev" || this.direction === "prevunique")) {
        throw new DataError();
      }
    }
    if (this._request) {
      this._request.readyState = "pending";
    }
    transaction._execRequestAsync({
      operation: this._iterate.bind(this, key),
      request: this._request,
      source: this.source
    });
    this._gotValue = false;
  }
  // hthttps://w3c.github.io/IndexedDB/#dom-idbcursor-continueprimarykey
  continuePrimaryKey(key, primaryKey) {
    const effectiveObjectStore = getEffectiveObjectStore(this);
    const transaction = effectiveObjectStore.transaction;
    if (transaction._state !== "active") {
      throw new TransactionInactiveError();
    }
    if (effectiveObjectStore._rawObjectStore.deleted) {
      throw new InvalidStateError();
    }
    if (!(this.source instanceof FDBObjectStore_default) && this.source._rawIndex.deleted) {
      throw new InvalidStateError();
    }
    if (this.source instanceof FDBObjectStore_default || this.direction !== "next" && this.direction !== "prev") {
      throw new InvalidAccessError();
    }
    if (!this._gotValue) {
      throw new InvalidStateError();
    }
    if (key === void 0 || primaryKey === void 0) {
      throw new DataError();
    }
    key = valueToKey_default(key);
    const cmpResult = cmp_default(key, this._position);
    if (cmpResult === -1 && this.direction === "next" || cmpResult === 1 && this.direction === "prev") {
      throw new DataError();
    }
    const cmpResult2 = cmp_default(primaryKey, this._objectStorePosition);
    if (cmpResult === 0) {
      if (cmpResult2 <= 0 && this.direction === "next" || cmpResult2 >= 0 && this.direction === "prev") {
        throw new DataError();
      }
    }
    if (this._request) {
      this._request.readyState = "pending";
    }
    transaction._execRequestAsync({
      operation: this._iterate.bind(this, key, primaryKey),
      request: this._request,
      source: this.source
    });
    this._gotValue = false;
  }
  delete() {
    const effectiveObjectStore = getEffectiveObjectStore(this);
    const effectiveKey = Object.hasOwn(this.source, "_rawIndex") ? this.primaryKey : this._position;
    const transaction = effectiveObjectStore.transaction;
    if (transaction._state !== "active") {
      throw new TransactionInactiveError();
    }
    if (transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }
    if (effectiveObjectStore._rawObjectStore.deleted) {
      throw new InvalidStateError();
    }
    if (!(this.source instanceof FDBObjectStore_default) && this.source._rawIndex.deleted) {
      throw new InvalidStateError();
    }
    if (!this._gotValue || !Object.hasOwn(this, "value")) {
      throw new InvalidStateError();
    }
    return transaction._execRequestAsync({
      operation: effectiveObjectStore._rawObjectStore.deleteRecord.bind(effectiveObjectStore._rawObjectStore, effectiveKey, transaction._rollbackLog),
      source: this
    });
  }
  get [Symbol.toStringTag]() {
    return "IDBCursor";
  }
};
var FDBCursor_default = FDBCursor;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBCursorWithValue.js
var FDBCursorWithValue = class extends FDBCursor_default {
  value = void 0;
  constructor(source, range, direction, request) {
    super(source, range, direction, request);
  }
  get [Symbol.toStringTag]() {
    return "IDBCursorWithValue";
  }
};
var FDBCursorWithValue_default = FDBCursorWithValue;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/FakeEventTarget.js
var stopped = (event, listener) => {
  return event.immediatePropagationStopped || event.eventPhase === event.CAPTURING_PHASE && listener.capture === false || event.eventPhase === event.BUBBLING_PHASE && listener.capture === true;
};
var invokeEventListeners = (event, obj) => {
  event.currentTarget = obj;
  const errors = [];
  const invoke = (callbackOrObject) => {
    try {
      const callback2 = typeof callbackOrObject === "function" ? callbackOrObject : callbackOrObject.handleEvent;
      callback2.call(event.currentTarget, event);
    } catch (err) {
      errors.push(err);
    }
  };
  for (const listener of obj.listeners.slice()) {
    if (event.type !== listener.type || stopped(event, listener)) {
      continue;
    }
    invoke(listener.callback);
  }
  const typeToProp = {
    abort: "onabort",
    blocked: "onblocked",
    close: "onclose",
    complete: "oncomplete",
    error: "onerror",
    success: "onsuccess",
    upgradeneeded: "onupgradeneeded",
    versionchange: "onversionchange"
  };
  const prop = typeToProp[event.type];
  if (prop === void 0) {
    throw new Error(`Unknown event type: "${event.type}"`);
  }
  const callback = event.currentTarget[prop];
  if (callback) {
    const listener = {
      callback,
      capture: false,
      type: event.type
    };
    if (!stopped(event, listener)) {
      invoke(listener.callback);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors);
  }
};
var FakeEventTarget = class {
  listeners = [];
  // These will be overridden in individual subclasses and made not readonly
  addEventListener(type, callback, options) {
    const capture = !!(typeof options === "object" && options ? options.capture : options);
    this.listeners.push({
      callback,
      capture,
      type
    });
  }
  removeEventListener(type, callback, options) {
    const capture = !!(typeof options === "object" && options ? options.capture : options);
    const i = this.listeners.findIndex((listener) => {
      return listener.type === type && listener.callback === callback && listener.capture === capture;
    });
    this.listeners.splice(i, 1);
  }
  // http://www.w3.org/TR/dom/#dispatching-events
  dispatchEvent(event) {
    if (event.dispatched || !event.initialized) {
      throw new InvalidStateError("The object is in an invalid state.");
    }
    event.isTrusted = false;
    event.dispatched = true;
    event.target = this;
    event.eventPhase = event.CAPTURING_PHASE;
    for (const obj of event.eventPath) {
      if (!event.propagationStopped) {
        invokeEventListeners(event, obj);
      }
    }
    event.eventPhase = event.AT_TARGET;
    if (!event.propagationStopped) {
      invokeEventListeners(event, event.target);
    }
    if (event.bubbles) {
      event.eventPath.reverse();
      event.eventPhase = event.BUBBLING_PHASE;
      for (const obj of event.eventPath) {
        if (!event.propagationStopped) {
          invokeEventListeners(event, obj);
        }
      }
    }
    event.dispatched = false;
    event.eventPhase = event.NONE;
    event.currentTarget = null;
    if (event.canceled) {
      return false;
    }
    return true;
  }
};
var FakeEventTarget_default = FakeEventTarget;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBRequest.js
var FDBRequest = class extends FakeEventTarget_default {
  _result = null;
  _error = null;
  source = null;
  transaction = null;
  readyState = "pending";
  onsuccess = null;
  onerror = null;
  get error() {
    if (this.readyState === "pending") {
      throw new InvalidStateError();
    }
    return this._error;
  }
  set error(value) {
    this._error = value;
  }
  get result() {
    if (this.readyState === "pending") {
      throw new InvalidStateError();
    }
    return this._result;
  }
  set result(value) {
    this._result = value;
  }
  get [Symbol.toStringTag]() {
    return "IDBRequest";
  }
};
var FDBRequest_default = FDBRequest;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/FakeDOMStringList.js
var FakeDOMStringList = class {
  constructor(...values) {
    this._values = values;
    for (let i = 0; i < values.length; i++) {
      this[i] = values[i];
    }
  }
  contains(value) {
    return this._values.includes(value);
  }
  item(i) {
    if (i < 0 || i >= this._values.length) {
      return null;
    }
    return this._values[i];
  }
  get length() {
    return this._values.length;
  }
  [Symbol.iterator]() {
    return this._values[Symbol.iterator]();
  }
  // Handled by proxy
  // Used internally, should not be used by others. I could maybe get rid of these and replace rather than mutate, but too lazy to check the spec.
  _push(...values) {
    for (let i = 0; i < values.length; i++) {
      this[this._values.length + i] = values[i];
    }
    this._values.push(...values);
  }
  _sort(...values) {
    this._values.sort(...values);
    for (let i = 0; i < this._values.length; i++) {
      this[i] = this._values[i];
    }
    return this;
  }
};
var FakeDOMStringList_default = FakeDOMStringList;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/valueToKeyRange.js
var valueToKeyRange = (value, nullDisallowedFlag = false) => {
  if (value instanceof FDBKeyRange_default) {
    return value;
  }
  if (value === null || value === void 0) {
    if (nullDisallowedFlag) {
      throw new DataError();
    }
    return new FDBKeyRange_default(void 0, void 0, false, false);
  }
  const key = valueToKey_default(value);
  return FDBKeyRange_default.only(key);
};
var valueToKeyRange_default = valueToKeyRange;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/getKeyPath.js
var convertKey = (key) => typeof key === "object" && key ? key + "" : key;
function getKeyPath(keyPath) {
  return Array.isArray(keyPath) ? keyPath.map(convertKey) : convertKey(keyPath);
}

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/isPotentiallyValidKeyRange.js
var isPotentiallyValidKeyRange = (value) => {
  if (value instanceof FDBKeyRange_default) {
    return true;
  }
  const key = valueToKeyWithoutThrowing_default(value);
  return key !== INVALID_TYPE;
};
var isPotentiallyValidKeyRange_default = isPotentiallyValidKeyRange;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/enforceRange.js
var enforceRange = (num, type) => {
  const min = 0;
  const max = type === "unsigned long" ? 4294967295 : 9007199254740991;
  if (isNaN(num) || num < min || num > max) {
    throw new TypeError();
  }
  if (num >= 0) {
    return Math.floor(num);
  }
};
var enforceRange_default = enforceRange;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/extractGetAllOptions.js
var extractGetAllOptions = (queryOrOptions, count, numArguments) => {
  let query;
  let direction;
  if (queryOrOptions === void 0 || queryOrOptions === null || isPotentiallyValidKeyRange_default(queryOrOptions)) {
    query = queryOrOptions;
    if (numArguments > 1 && count !== void 0) {
      count = enforceRange_default(count, "unsigned long");
    }
  } else {
    const getAllOptions = queryOrOptions;
    if (getAllOptions.query !== void 0) {
      query = getAllOptions.query;
    }
    if (getAllOptions.count !== void 0) {
      count = enforceRange_default(getAllOptions.count, "unsigned long");
    }
    if (getAllOptions.direction !== void 0) {
      direction = getAllOptions.direction;
    }
  }
  return {
    query,
    count,
    direction
  };
};
var extractGetAllOptions_default = extractGetAllOptions;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBIndex.js
var confirmActiveTransaction = (index) => {
  if (index._rawIndex.deleted || index.objectStore._rawObjectStore.deleted) {
    throw new InvalidStateError();
  }
  if (index.objectStore.transaction._state !== "active") {
    throw new TransactionInactiveError();
  }
};
var FDBIndex = class {
  constructor(objectStore, rawIndex) {
    this._rawIndex = rawIndex;
    this._name = rawIndex.name;
    this.objectStore = objectStore;
    this.keyPath = getKeyPath(rawIndex.keyPath);
    this.multiEntry = rawIndex.multiEntry;
    this.unique = rawIndex.unique;
  }
  get name() {
    return this._name;
  }
  // https://w3c.github.io/IndexedDB/#dom-idbindex-name
  set name(name) {
    const transaction = this.objectStore.transaction;
    if (!transaction.db._runningVersionchangeTransaction) {
      throw transaction._state === "active" ? new InvalidStateError() : new TransactionInactiveError();
    }
    if (transaction._state !== "active") {
      throw new TransactionInactiveError();
    }
    if (this._rawIndex.deleted || this.objectStore._rawObjectStore.deleted) {
      throw new InvalidStateError();
    }
    name = String(name);
    if (name === this._name) {
      return;
    }
    if (this.objectStore.indexNames.contains(name)) {
      throw new ConstraintError();
    }
    const oldName = this._name;
    const oldIndexNames = [...this.objectStore.indexNames];
    this._name = name;
    this._rawIndex.name = name;
    this.objectStore._indexesCache.delete(oldName);
    this.objectStore._indexesCache.set(name, this);
    this.objectStore._rawObjectStore.rawIndexes.delete(oldName);
    this.objectStore._rawObjectStore.rawIndexes.set(name, this._rawIndex);
    this.objectStore.indexNames = new FakeDOMStringList_default(...Array.from(this.objectStore._rawObjectStore.rawIndexes.keys()).filter((indexName) => {
      const index = this.objectStore._rawObjectStore.rawIndexes.get(indexName);
      return index && !index.deleted;
    }).sort());
    if (!this.objectStore.transaction._createdIndexes.has(this._rawIndex)) {
      transaction._rollbackLog.push(() => {
        this._name = oldName;
        this._rawIndex.name = oldName;
        this.objectStore._indexesCache.delete(name);
        this.objectStore._indexesCache.set(oldName, this);
        this.objectStore._rawObjectStore.rawIndexes.delete(name);
        this.objectStore._rawObjectStore.rawIndexes.set(oldName, this._rawIndex);
        this.objectStore.indexNames = new FakeDOMStringList_default(...oldIndexNames);
      });
    }
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-openCursor-IDBRequest-any-range-IDBCursorDirection-direction
  openCursor(range, direction) {
    confirmActiveTransaction(this);
    if (range === null) {
      range = void 0;
    }
    if (range !== void 0 && !(range instanceof FDBKeyRange_default)) {
      range = FDBKeyRange_default.only(valueToKey_default(range));
    }
    const request = new FDBRequest_default();
    request.source = this;
    request.transaction = this.objectStore.transaction;
    const cursor = new FDBCursorWithValue_default(this, range, direction, request);
    return this.objectStore.transaction._execRequestAsync({
      operation: cursor._iterate.bind(cursor),
      request,
      source: this
    });
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-openKeyCursor-IDBRequest-any-range-IDBCursorDirection-direction
  openKeyCursor(range, direction) {
    confirmActiveTransaction(this);
    if (range === null) {
      range = void 0;
    }
    if (range !== void 0 && !(range instanceof FDBKeyRange_default)) {
      range = FDBKeyRange_default.only(valueToKey_default(range));
    }
    const request = new FDBRequest_default();
    request.source = this;
    request.transaction = this.objectStore.transaction;
    const cursor = new FDBCursor_default(this, range, direction, request, true);
    return this.objectStore.transaction._execRequestAsync({
      operation: cursor._iterate.bind(cursor),
      request,
      source: this
    });
  }
  get(key) {
    confirmActiveTransaction(this);
    if (!(key instanceof FDBKeyRange_default)) {
      key = valueToKey_default(key);
    }
    return this.objectStore.transaction._execRequestAsync({
      operation: this._rawIndex.getValue.bind(this._rawIndex, key),
      source: this
    });
  }
  // http://w3c.github.io/IndexedDB/#dom-idbindex-getall
  getAll(queryOrOptions, count) {
    const options = extractGetAllOptions_default(queryOrOptions, count, arguments.length);
    confirmActiveTransaction(this);
    const range = valueToKeyRange_default(options.query);
    return this.objectStore.transaction._execRequestAsync({
      operation: this._rawIndex.getAllValues.bind(this._rawIndex, range, options.count, options.direction),
      source: this
    });
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-getKey-IDBRequest-any-key
  getKey(key) {
    confirmActiveTransaction(this);
    if (!(key instanceof FDBKeyRange_default)) {
      key = valueToKey_default(key);
    }
    return this.objectStore.transaction._execRequestAsync({
      operation: this._rawIndex.getKey.bind(this._rawIndex, key),
      source: this
    });
  }
  // http://w3c.github.io/IndexedDB/#dom-idbindex-getallkeys
  getAllKeys(queryOrOptions, count) {
    const options = extractGetAllOptions_default(queryOrOptions, count, arguments.length);
    confirmActiveTransaction(this);
    const range = valueToKeyRange_default(options.query);
    return this.objectStore.transaction._execRequestAsync({
      operation: this._rawIndex.getAllKeys.bind(this._rawIndex, range, options.count, options.direction),
      source: this
    });
  }
  // https://www.w3.org/TR/IndexedDB/#dom-idbobjectstore-getallrecords
  getAllRecords(options) {
    let query;
    let count;
    let direction;
    if (options !== void 0) {
      if (options.query !== void 0) {
        query = options.query;
      }
      if (options.count !== void 0) {
        count = enforceRange_default(options.count, "unsigned long");
      }
      if (options.direction !== void 0) {
        direction = options.direction;
      }
    }
    confirmActiveTransaction(this);
    const range = valueToKeyRange_default(query);
    return this.objectStore.transaction._execRequestAsync({
      operation: this._rawIndex.getAllRecords.bind(this._rawIndex, range, count, direction),
      source: this
    });
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-count-IDBRequest-any-key
  count(key) {
    confirmActiveTransaction(this);
    if (key === null) {
      key = void 0;
    }
    if (key !== void 0 && !(key instanceof FDBKeyRange_default)) {
      key = FDBKeyRange_default.only(valueToKey_default(key));
    }
    return this.objectStore.transaction._execRequestAsync({
      operation: () => {
        return this._rawIndex.count(key);
      },
      source: this
    });
  }
  get [Symbol.toStringTag]() {
    return "IDBIndex";
  }
};
var FDBIndex_default = FDBIndex;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/canInjectKey.js
var canInjectKey = (keyPath, value) => {
  if (Array.isArray(keyPath)) {
    throw new Error("The key paths used in this section are always strings and never sequences, since it is not possible to create a object store which has a key generator and also has a key path that is a sequence.");
  }
  const identifiers = keyPath.split(".");
  if (identifiers.length === 0) {
    throw new Error("Assert: identifiers is not empty");
  }
  identifiers.pop();
  for (const identifier of identifiers) {
    if (typeof value !== "object" && !Array.isArray(value)) {
      return false;
    }
    const hop = Object.hasOwn(value, identifier);
    if (!hop) {
      return true;
    }
    value = value[identifier];
  }
  return typeof value === "object" || Array.isArray(value);
};
var canInjectKey_default = canInjectKey;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBRecord.js
var FDBRecord = class {
  constructor(key, primaryKey, value) {
    this._key = key;
    this._primaryKey = primaryKey;
    this._value = value;
  }
  get key() {
    return this._key;
  }
  set key(_) {
  }
  get primaryKey() {
    return this._primaryKey;
  }
  set primaryKey(_) {
  }
  get value() {
    return this._value;
  }
  set value(_) {
  }
  get [Symbol.toStringTag]() {
    return "IDBRecord";
  }
};
var FDBRecord_default = FDBRecord;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/binarySearchTree.js
var MAX_TOMBSTONE_FACTOR = 2 / 3;
var EVERYTHING_KEY_RANGE = new FDBKeyRange_default(void 0, void 0, false, false);
var BinarySearchTree = class {
  _numTombstones = 0;
  _numNodes = 0;
  /**
   *
   * @param keysAreUnique - whether keys can be unique, and thus whether we cn skip checking `record.value` when
   * comparing. This is basically used to distinguish ObjectStores (where the value is the entire object, not used
   * as a key) from non-unique Indexes (where both the key and the value are meaningful keys used for sorting)
   */
  constructor(keysAreUnique) {
    this._keysAreUnique = !!keysAreUnique;
  }
  size() {
    return this._numNodes - this._numTombstones;
  }
  get(record) {
    return this._getByComparator(this._root, (otherRecord) => this._compare(record, otherRecord));
  }
  contains(record) {
    return !!this.get(record);
  }
  _compare(a, b) {
    const keyComparison = cmp_default(a.key, b.key);
    if (keyComparison !== 0) {
      return keyComparison;
    }
    return this._keysAreUnique ? 0 : cmp_default(a.value, b.value);
  }
  _getByComparator(node, comparator) {
    let current = node;
    while (current) {
      const comparison = comparator(current.record);
      if (comparison < 0) {
        current = current.left;
      } else if (comparison > 0) {
        current = current.right;
      } else {
        return current.record;
      }
    }
  }
  /**
   * Put a new record, and return the overwritten record if an overwrite occurred.
   * @param record
   * @param noOverwrite - throw a ConstraintError in case of overwrite
   */
  put(record, noOverwrite = false) {
    if (!this._root) {
      this._root = {
        record,
        left: void 0,
        right: void 0,
        parent: void 0,
        deleted: false,
        // the root is always black in a red-black tree
        red: false
      };
      this._numNodes++;
      return;
    }
    return this._put(this._root, record, noOverwrite);
  }
  _put(node, record, noOverwrite) {
    const comparison = this._compare(record, node.record);
    if (comparison < 0) {
      if (node.left) {
        return this._put(node.left, record, noOverwrite);
      } else {
        node.left = {
          record,
          left: void 0,
          right: void 0,
          parent: node,
          deleted: false,
          red: true
        };
        this._onNewNodeInserted(node.left);
      }
    } else if (comparison > 0) {
      if (node.right) {
        return this._put(node.right, record, noOverwrite);
      } else {
        node.right = {
          record,
          left: void 0,
          right: void 0,
          parent: node,
          deleted: false,
          red: true
        };
        this._onNewNodeInserted(node.right);
      }
    } else if (node.deleted) {
      node.deleted = false;
      node.record = record;
      this._numTombstones--;
    } else if (noOverwrite) {
      throw new ConstraintError();
    } else {
      const overwrittenRecord = node.record;
      node.record = record;
      return overwrittenRecord;
    }
  }
  delete(record) {
    if (!this._root) {
      return;
    }
    this._delete(this._root, record);
    if (this._numTombstones > this._numNodes * MAX_TOMBSTONE_FACTOR) {
      const records = [...this.getAllRecords()];
      this._root = this._rebuild(records, void 0, false);
      this._numNodes = records.length;
      this._numTombstones = 0;
    }
  }
  _delete(node, record) {
    if (!node) {
      return;
    }
    const comparison = this._compare(record, node.record);
    if (comparison < 0) {
      this._delete(node.left, record);
    } else if (comparison > 0) {
      this._delete(node.right, record);
    } else if (!node.deleted) {
      this._numTombstones++;
      node.deleted = true;
    }
  }
  *getAllRecords(descending = false) {
    yield* this.getRecords(EVERYTHING_KEY_RANGE, descending);
  }
  *getRecords(keyRange, descending = false) {
    yield* this._getRecordsForNode(this._root, keyRange, descending);
  }
  *_getRecordsForNode(node, keyRange, descending = false) {
    if (!node) {
      return;
    }
    yield* this._findRecords(node, keyRange, descending);
  }
  *_findRecords(node, keyRange, descending = false) {
    const {
      lower,
      upper,
      lowerOpen,
      upperOpen
    } = keyRange;
    const {
      record: {
        key
      }
    } = node;
    const lowerComparison = lower === void 0 ? -1 : cmp_default(lower, key);
    const upperComparison = upper === void 0 ? 1 : cmp_default(upper, key);
    const moreLeft = this._keysAreUnique ? lowerComparison < 0 : lowerComparison <= 0;
    const moreRight = this._keysAreUnique ? upperComparison > 0 : upperComparison >= 0;
    const moreStart = descending ? moreRight : moreLeft;
    const moreEnd = descending ? moreLeft : moreRight;
    const start = descending ? "right" : "left";
    const end = descending ? "left" : "right";
    const lowerMatches = lowerOpen ? lowerComparison < 0 : lowerComparison <= 0;
    const upperMatches = upperOpen ? upperComparison > 0 : upperComparison >= 0;
    if (moreStart && node[start]) {
      yield* this._findRecords(node[start], keyRange, descending);
    }
    if (lowerMatches && upperMatches && !node.deleted) {
      yield node.record;
    }
    if (moreEnd && node[end]) {
      yield* this._findRecords(node[end], keyRange, descending);
    }
  }
  _onNewNodeInserted(newNode) {
    this._numNodes++;
    this._rebalanceTree(newNode);
  }
  // based on https://en.wikipedia.org/wiki/Red%E2%80%93black_tree#Insertion
  _rebalanceTree(node) {
    let parent = node.parent;
    do {
      if (!parent.red) {
        return;
      }
      const grandparent = parent.parent;
      if (!grandparent) {
        parent.red = false;
        return;
      }
      const parentIsRightChild = parent === grandparent.right;
      const uncle = parentIsRightChild ? grandparent.left : grandparent.right;
      if (!uncle || !uncle.red) {
        if (node === (parentIsRightChild ? parent.left : parent.right)) {
          this._rotateSubtree(parent, parentIsRightChild);
          node = parent;
          parent = parentIsRightChild ? grandparent.right : grandparent.left;
        }
        this._rotateSubtree(grandparent, !parentIsRightChild);
        parent.red = false;
        grandparent.red = true;
        return;
      }
      parent.red = false;
      uncle.red = false;
      grandparent.red = true;
      node = grandparent;
    } while (node.parent ? parent = node.parent : false);
  }
  // based on https://en.wikipedia.org/wiki/Red%E2%80%93black_tree#Implementation
  _rotateSubtree(node, right) {
    const parent = node.parent;
    const newRoot = right ? node.left : node.right;
    const newChild = right ? newRoot.right : newRoot.left;
    node[right ? "left" : "right"] = newChild;
    if (newChild) {
      newChild.parent = node;
    }
    newRoot[right ? "right" : "left"] = node;
    newRoot.parent = parent;
    node.parent = newRoot;
    if (parent) {
      parent[node === parent.right ? "right" : "left"] = newRoot;
    } else {
      this._root = newRoot;
    }
    return newRoot;
  }
  // rebuild the whole tree from scratch, used to avoid too many deletion tombstones accumulating
  _rebuild(records, parent, red) {
    const {
      length
    } = records;
    if (!length) {
      return void 0;
    }
    const mid = length >>> 1;
    const node = {
      record: records[mid],
      left: void 0,
      right: void 0,
      parent,
      deleted: false,
      red
    };
    const left = this._rebuild(records.slice(0, mid), node, !red);
    const right = this._rebuild(records.slice(mid + 1), node, !red);
    node.left = left;
    node.right = right;
    return node;
  }
};

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/RecordStore.js
var RecordStore = class {
  constructor(keysAreUnique) {
    this.keysAreUnique = keysAreUnique;
    this.records = new BinarySearchTree(this.keysAreUnique);
  }
  get(key) {
    const range = key instanceof FDBKeyRange_default ? key : FDBKeyRange_default.only(key);
    return this.records.getRecords(range).next().value;
  }
  /**
   * Put a new record, and return the overwritten record if an overwrite occurred.
   * @param newRecord
   * @param noOverwrite - throw a ConstraintError in case of overwrite
   */
  put(newRecord, noOverwrite = false) {
    return this.records.put(newRecord, noOverwrite);
  }
  delete(key) {
    const range = key instanceof FDBKeyRange_default ? key : FDBKeyRange_default.only(key);
    const deletedRecords = [...this.records.getRecords(range)];
    for (const record of deletedRecords) {
      this.records.delete(record);
    }
    return deletedRecords;
  }
  deleteByValue(key) {
    const range = key instanceof FDBKeyRange_default ? key : FDBKeyRange_default.only(key);
    const deletedRecords = [];
    for (const record of this.records.getAllRecords()) {
      if (range.includes(record.value)) {
        this.records.delete(record);
        deletedRecords.push(record);
      }
    }
    return deletedRecords;
  }
  clear() {
    const deletedRecords = [...this.records.getAllRecords()];
    this.records = new BinarySearchTree(this.keysAreUnique);
    return deletedRecords;
  }
  values(range, direction = "next") {
    const descending = direction === "prev" || direction === "prevunique";
    const records = range ? this.records.getRecords(range, descending) : this.records.getAllRecords(descending);
    return {
      [Symbol.iterator]: () => {
        const next = () => {
          return records.next();
        };
        if (direction === "next" || direction === "prev") {
          return {
            next
          };
        }
        if (direction === "nextunique") {
          let previousValue = void 0;
          return {
            next: () => {
              let current2 = next();
              while (!current2.done && previousValue !== void 0 && cmp_default(previousValue.key, current2.value.key) === 0) {
                current2 = next();
              }
              previousValue = current2.value;
              return current2;
            }
          };
        }
        let current = next();
        let nextResult = next();
        return {
          next: () => {
            while (!nextResult.done && cmp_default(current.value.key, nextResult.value.key) === 0) {
              current = nextResult;
              nextResult = next();
            }
            const result = current;
            current = nextResult;
            nextResult = next();
            return result;
          }
        };
      }
    };
  }
  size() {
    return this.records.size();
  }
};
var RecordStore_default = RecordStore;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/Index.js
var Index = class {
  deleted = false;
  // Initialized should be used to decide whether to throw an error or abort the versionchange transaction when there is a
  // constraint
  initialized = false;
  constructor(rawObjectStore, name, keyPath, multiEntry, unique) {
    this.rawObjectStore = rawObjectStore;
    this.name = name;
    this.keyPath = keyPath;
    this.multiEntry = multiEntry;
    this.unique = unique;
    this.records = new RecordStore_default(unique);
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-retrieving-a-value-from-an-index
  getKey(key) {
    const record = this.records.get(key);
    return record !== void 0 ? record.value : void 0;
  }
  // http://w3c.github.io/IndexedDB/#retrieve-multiple-referenced-values-from-an-index
  getAllKeys(range, count, direction) {
    if (count === void 0 || count === 0) {
      count = Infinity;
    }
    const records = [];
    for (const record of this.records.values(range, direction)) {
      records.push(structuredClone(record.value));
      if (records.length >= count) {
        break;
      }
    }
    return records;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#index-referenced-value-retrieval-operation
  getValue(key) {
    const record = this.records.get(key);
    return record !== void 0 ? this.rawObjectStore.getValue(record.value) : void 0;
  }
  // http://w3c.github.io/IndexedDB/#retrieve-multiple-referenced-values-from-an-index
  getAllValues(range, count, direction) {
    if (count === void 0 || count === 0) {
      count = Infinity;
    }
    const records = [];
    for (const record of this.records.values(range, direction)) {
      records.push(this.rawObjectStore.getValue(record.value));
      if (records.length >= count) {
        break;
      }
    }
    return records;
  }
  // https://www.w3.org/TR/IndexedDB/#dom-idbindex-getallrecords
  getAllRecords(range, count, direction) {
    if (count === void 0 || count === 0) {
      count = Infinity;
    }
    const records = [];
    for (const record of this.records.values(range, direction)) {
      records.push(new FDBRecord_default(structuredClone(record.key), structuredClone(this.rawObjectStore.getKey(record.value)), this.rawObjectStore.getValue(record.value)));
      if (records.length >= count) {
        break;
      }
    }
    return records;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-storing-a-record-into-an-object-store (step 7)
  storeRecord(newRecord) {
    let indexKey;
    try {
      indexKey = extractKey_default(this.keyPath, newRecord.value).key;
    } catch (err) {
      if (err.name === "DataError") {
        return;
      }
      throw err;
    }
    if (!this.multiEntry || !Array.isArray(indexKey)) {
      try {
        valueToKey_default(indexKey);
      } catch (e) {
        return;
      }
    } else {
      const keep = [];
      for (const part of indexKey) {
        if (keep.indexOf(part) < 0) {
          try {
            keep.push(valueToKey_default(part));
          } catch (err) {
          }
        }
      }
      indexKey = keep;
    }
    if (!this.multiEntry || !Array.isArray(indexKey)) {
      if (this.unique) {
        const existingRecord = this.records.get(indexKey);
        if (existingRecord) {
          throw new ConstraintError();
        }
      }
    } else {
      if (this.unique) {
        for (const individualIndexKey of indexKey) {
          const existingRecord = this.records.get(individualIndexKey);
          if (existingRecord) {
            throw new ConstraintError();
          }
        }
      }
    }
    if (!this.multiEntry || !Array.isArray(indexKey)) {
      this.records.put({
        key: indexKey,
        value: newRecord.key
      });
    } else {
      for (const individualIndexKey of indexKey) {
        this.records.put({
          key: individualIndexKey,
          value: newRecord.key
        });
      }
    }
  }
  initialize(transaction) {
    if (this.initialized) {
      throw new Error("Index already initialized");
    }
    transaction._execRequestAsync({
      operation: () => {
        try {
          for (const record of this.rawObjectStore.records.values()) {
            this.storeRecord(record);
          }
          this.initialized = true;
        } catch (err) {
          transaction._abort(err.name);
        }
      },
      source: null
    });
  }
  count(range) {
    let count = 0;
    for (const record of this.records.values(range)) {
      count += 1;
    }
    return count;
  }
};
var Index_default = Index;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/validateKeyPath.js
var validateKeyPath = (keyPath, parent) => {
  if (keyPath !== void 0 && keyPath !== null && typeof keyPath !== "string" && keyPath.toString && (parent === "array" || !Array.isArray(keyPath))) {
    keyPath = keyPath.toString();
  }
  if (typeof keyPath === "string") {
    if (keyPath === "" && parent !== "string") {
      return;
    }
    try {
      const validIdentifierRegex = (
        // eslint-disable-next-line no-misleading-character-class
        /^(?:[$A-Z_a-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B2\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC])(?:[$0-9A-Z_a-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B2\u08E4-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA69D\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2D\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC])*$/
      );
      if (keyPath.length >= 1 && validIdentifierRegex.test(keyPath)) {
        return;
      }
    } catch (err) {
      throw new SyntaxError2(err.message);
    }
    if (keyPath.indexOf(" ") >= 0) {
      throw new SyntaxError2("The keypath argument contains an invalid key path (no spaces allowed).");
    }
  }
  if (Array.isArray(keyPath) && keyPath.length > 0) {
    if (parent) {
      throw new SyntaxError2("The keypath argument contains an invalid key path (nested arrays).");
    }
    for (const part of keyPath) {
      validateKeyPath(part, "array");
    }
    return;
  } else if (typeof keyPath === "string" && keyPath.indexOf(".") >= 0) {
    keyPath = keyPath.split(".");
    for (const part of keyPath) {
      validateKeyPath(part, "string");
    }
    return;
  }
  throw new SyntaxError2();
};
var validateKeyPath_default = validateKeyPath;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBObjectStore.js
var confirmActiveTransaction2 = (objectStore) => {
  if (objectStore._rawObjectStore.deleted) {
    throw new InvalidStateError();
  }
  if (objectStore.transaction._state !== "active") {
    throw new TransactionInactiveError();
  }
};
var buildRecordAddPut = (objectStore, value, key) => {
  confirmActiveTransaction2(objectStore);
  if (objectStore.transaction.mode === "readonly") {
    throw new ReadOnlyError();
  }
  if (objectStore.keyPath !== null) {
    if (key !== void 0) {
      throw new DataError();
    }
  }
  const clone = cloneValueForInsertion(value, objectStore.transaction);
  if (objectStore.keyPath !== null) {
    const tempKey = extractKey_default(objectStore.keyPath, clone);
    if (tempKey.type === "found") {
      valueToKey_default(tempKey.key);
    } else {
      if (!objectStore._rawObjectStore.keyGenerator) {
        throw new DataError();
      } else if (!canInjectKey_default(objectStore.keyPath, clone)) {
        throw new DataError();
      }
    }
  }
  if (objectStore.keyPath === null && objectStore._rawObjectStore.keyGenerator === null && key === void 0) {
    throw new DataError();
  }
  if (key !== void 0) {
    key = valueToKey_default(key);
  }
  return {
    key,
    value: clone
  };
};
var FDBObjectStore = class {
  _indexesCache = /* @__PURE__ */ new Map();
  constructor(transaction, rawObjectStore) {
    this._rawObjectStore = rawObjectStore;
    this._name = rawObjectStore.name;
    this.keyPath = getKeyPath(rawObjectStore.keyPath);
    this.autoIncrement = rawObjectStore.autoIncrement;
    this.transaction = transaction;
    this.indexNames = new FakeDOMStringList_default(...Array.from(rawObjectStore.rawIndexes.keys()).sort());
  }
  get name() {
    return this._name;
  }
  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-name
  set name(name) {
    const transaction = this.transaction;
    if (!transaction.db._runningVersionchangeTransaction) {
      throw transaction._state === "active" ? new InvalidStateError() : new TransactionInactiveError();
    }
    confirmActiveTransaction2(this);
    name = String(name);
    if (name === this._name) {
      return;
    }
    if (this._rawObjectStore.rawDatabase.rawObjectStores.has(name)) {
      throw new ConstraintError();
    }
    const oldName = this._name;
    const oldObjectStoreNames = [...transaction.db.objectStoreNames];
    this._name = name;
    this._rawObjectStore.name = name;
    this.transaction._objectStoresCache.delete(oldName);
    this.transaction._objectStoresCache.set(name, this);
    this._rawObjectStore.rawDatabase.rawObjectStores.delete(oldName);
    this._rawObjectStore.rawDatabase.rawObjectStores.set(name, this._rawObjectStore);
    transaction.db.objectStoreNames = new FakeDOMStringList_default(...Array.from(this._rawObjectStore.rawDatabase.rawObjectStores.keys()).filter((objectStoreName) => {
      const objectStore = this._rawObjectStore.rawDatabase.rawObjectStores.get(objectStoreName);
      return objectStore && !objectStore.deleted;
    }).sort());
    const oldScope = new Set(transaction._scope);
    const oldTransactionObjectStoreNames = [...transaction.objectStoreNames];
    this.transaction._scope.delete(oldName);
    transaction._scope.add(name);
    transaction.objectStoreNames = new FakeDOMStringList_default(...Array.from(transaction._scope).sort());
    if (!this.transaction._createdObjectStores.has(this._rawObjectStore)) {
      transaction._rollbackLog.push(() => {
        this._name = oldName;
        this._rawObjectStore.name = oldName;
        this.transaction._objectStoresCache.delete(name);
        this.transaction._objectStoresCache.set(oldName, this);
        this._rawObjectStore.rawDatabase.rawObjectStores.delete(name);
        this._rawObjectStore.rawDatabase.rawObjectStores.set(oldName, this._rawObjectStore);
        transaction.db.objectStoreNames = new FakeDOMStringList_default(...oldObjectStoreNames);
        transaction._scope = oldScope;
        transaction.objectStoreNames = new FakeDOMStringList_default(...oldTransactionObjectStoreNames);
      });
    }
  }
  put(value, key) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    const record = buildRecordAddPut(this, value, key);
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.storeRecord.bind(this._rawObjectStore, record, false, this.transaction._rollbackLog),
      source: this
    });
  }
  add(value, key) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    const record = buildRecordAddPut(this, value, key);
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.storeRecord.bind(this._rawObjectStore, record, true, this.transaction._rollbackLog),
      source: this
    });
  }
  delete(key) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    confirmActiveTransaction2(this);
    if (this.transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }
    if (!(key instanceof FDBKeyRange_default)) {
      key = valueToKey_default(key);
    }
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.deleteRecord.bind(this._rawObjectStore, key, this.transaction._rollbackLog),
      source: this
    });
  }
  get(key) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    confirmActiveTransaction2(this);
    if (!(key instanceof FDBKeyRange_default)) {
      key = valueToKey_default(key);
    }
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.getValue.bind(this._rawObjectStore, key),
      source: this
    });
  }
  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-getall
  getAll(queryOrOptions, count) {
    const options = extractGetAllOptions_default(queryOrOptions, count, arguments.length);
    confirmActiveTransaction2(this);
    const range = valueToKeyRange_default(options.query);
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.getAllValues.bind(this._rawObjectStore, range, options.count, options.direction),
      source: this
    });
  }
  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-getkey
  getKey(key) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    confirmActiveTransaction2(this);
    if (!(key instanceof FDBKeyRange_default)) {
      key = valueToKey_default(key);
    }
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.getKey.bind(this._rawObjectStore, key),
      source: this
    });
  }
  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-getallkeys
  getAllKeys(queryOrOptions, count) {
    const options = extractGetAllOptions_default(queryOrOptions, count, arguments.length);
    confirmActiveTransaction2(this);
    const range = valueToKeyRange_default(options.query);
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.getAllKeys.bind(this._rawObjectStore, range, options.count, options.direction),
      source: this
    });
  }
  // https://www.w3.org/TR/IndexedDB/#dom-idbobjectstore-getallrecords
  getAllRecords(options) {
    let query;
    let count;
    let direction;
    if (options !== void 0) {
      if (options.query !== void 0) {
        query = options.query;
      }
      if (options.count !== void 0) {
        count = enforceRange_default(options.count, "unsigned long");
      }
      if (options.direction !== void 0) {
        direction = options.direction;
      }
    }
    confirmActiveTransaction2(this);
    const range = valueToKeyRange_default(query);
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.getAllRecords.bind(this._rawObjectStore, range, count, direction),
      source: this
    });
  }
  clear() {
    confirmActiveTransaction2(this);
    if (this.transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }
    return this.transaction._execRequestAsync({
      operation: this._rawObjectStore.clear.bind(this._rawObjectStore, this.transaction._rollbackLog),
      source: this
    });
  }
  openCursor(range, direction) {
    confirmActiveTransaction2(this);
    if (range === null) {
      range = void 0;
    }
    if (range !== void 0 && !(range instanceof FDBKeyRange_default)) {
      range = FDBKeyRange_default.only(valueToKey_default(range));
    }
    const request = new FDBRequest_default();
    request.source = this;
    request.transaction = this.transaction;
    const cursor = new FDBCursorWithValue_default(this, range, direction, request);
    return this.transaction._execRequestAsync({
      operation: cursor._iterate.bind(cursor),
      request,
      source: this
    });
  }
  openKeyCursor(range, direction) {
    confirmActiveTransaction2(this);
    if (range === null) {
      range = void 0;
    }
    if (range !== void 0 && !(range instanceof FDBKeyRange_default)) {
      range = FDBKeyRange_default.only(valueToKey_default(range));
    }
    const request = new FDBRequest_default();
    request.source = this;
    request.transaction = this.transaction;
    const cursor = new FDBCursor_default(this, range, direction, request, true);
    return this.transaction._execRequestAsync({
      operation: cursor._iterate.bind(cursor),
      request,
      source: this
    });
  }
  // tslint:-next-line max-line-length
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBObjectStore-createIndex-IDBIndex-DOMString-name-DOMString-sequence-DOMString--keyPath-IDBIndexParameters-optionalParameters
  createIndex(name, keyPath, optionalParameters = {}) {
    if (arguments.length < 2) {
      throw new TypeError();
    }
    const multiEntry = optionalParameters.multiEntry !== void 0 ? optionalParameters.multiEntry : false;
    const unique = optionalParameters.unique !== void 0 ? optionalParameters.unique : false;
    if (this.transaction.mode !== "versionchange") {
      throw new InvalidStateError();
    }
    confirmActiveTransaction2(this);
    if (this.indexNames.contains(name)) {
      throw new ConstraintError();
    }
    validateKeyPath_default(keyPath);
    if (Array.isArray(keyPath) && multiEntry) {
      throw new InvalidAccessError();
    }
    const indexNames = [...this.indexNames];
    const index = new Index_default(this._rawObjectStore, name, keyPath, multiEntry, unique);
    this.indexNames._push(name);
    this.indexNames._sort();
    this.transaction._createdIndexes.add(index);
    this._rawObjectStore.rawIndexes.set(name, index);
    index.initialize(this.transaction);
    this.transaction._rollbackLog.push(() => {
      index.deleted = true;
      this.indexNames = new FakeDOMStringList_default(...indexNames);
      this._rawObjectStore.rawIndexes.delete(index.name);
    });
    return new FDBIndex_default(this, index);
  }
  // https://w3c.github.io/IndexedDB/#dom-idbobjectstore-index
  index(name) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    if (this._rawObjectStore.deleted || this.transaction._state === "finished") {
      throw new InvalidStateError();
    }
    const index = this._indexesCache.get(name);
    if (index !== void 0) {
      return index;
    }
    const rawIndex = this._rawObjectStore.rawIndexes.get(name);
    if (!this.indexNames.contains(name) || rawIndex === void 0) {
      throw new NotFoundError();
    }
    const index2 = new FDBIndex_default(this, rawIndex);
    this._indexesCache.set(name, index2);
    return index2;
  }
  deleteIndex(name) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    if (this.transaction.mode !== "versionchange") {
      throw new InvalidStateError();
    }
    confirmActiveTransaction2(this);
    const rawIndex = this._rawObjectStore.rawIndexes.get(name);
    if (rawIndex === void 0) {
      throw new NotFoundError();
    }
    this.transaction._rollbackLog.push(() => {
      rawIndex.deleted = false;
      this._rawObjectStore.rawIndexes.set(rawIndex.name, rawIndex);
      this.indexNames._push(rawIndex.name);
      this.indexNames._sort();
    });
    this.indexNames = new FakeDOMStringList_default(...Array.from(this.indexNames).filter((indexName) => {
      return indexName !== name;
    }));
    rawIndex.deleted = true;
    this.transaction._execRequestAsync({
      operation: () => {
        const rawIndex2 = this._rawObjectStore.rawIndexes.get(name);
        if (rawIndex === rawIndex2) {
          this._rawObjectStore.rawIndexes.delete(name);
        }
      },
      source: this
    });
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBObjectStore-count-IDBRequest-any-key
  count(key) {
    confirmActiveTransaction2(this);
    if (key === null) {
      key = void 0;
    }
    if (key !== void 0 && !(key instanceof FDBKeyRange_default)) {
      key = FDBKeyRange_default.only(valueToKey_default(key));
    }
    return this.transaction._execRequestAsync({
      operation: () => {
        return this._rawObjectStore.count(key);
      },
      source: this
    });
  }
  get [Symbol.toStringTag]() {
    return "IDBObjectStore";
  }
};
var FDBObjectStore_default = FDBObjectStore;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/FakeEvent.js
var Event = class {
  eventPath = [];
  NONE = 0;
  CAPTURING_PHASE = 1;
  AT_TARGET = 2;
  BUBBLING_PHASE = 3;
  // Flags
  propagationStopped = false;
  immediatePropagationStopped = false;
  canceled = false;
  initialized = true;
  dispatched = false;
  target = null;
  currentTarget = null;
  eventPhase = 0;
  defaultPrevented = false;
  isTrusted = false;
  timeStamp = Date.now();
  constructor(type, eventInitDict = {}) {
    this.type = type;
    this.bubbles = eventInitDict.bubbles !== void 0 ? eventInitDict.bubbles : false;
    this.cancelable = eventInitDict.cancelable !== void 0 ? eventInitDict.cancelable : false;
  }
  preventDefault() {
    if (this.cancelable) {
      this.canceled = true;
    }
  }
  stopPropagation() {
    this.propagationStopped = true;
  }
  stopImmediatePropagation() {
    this.propagationStopped = true;
    this.immediatePropagationStopped = true;
  }
};
var FakeEvent_default = Event;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/scheduling.js
function getSetImmediateFromJsdom() {
  if (typeof navigator !== "undefined" && /jsdom/.test(navigator.userAgent)) {
    const outerRealmFunctionConstructor = Node.constructor;
    return new outerRealmFunctionConstructor("return setImmediate")();
  } else {
    return void 0;
  }
}
var schedulerPostTask = typeof scheduler !== "undefined" && ((fn) => scheduler.postTask(fn));
var doSetTimeout = (fn) => setTimeout(fn, 0);
var queueTask = (fn) => {
  const setImmediate = globalThis.setImmediate || getSetImmediateFromJsdom() || schedulerPostTask || doSetTimeout;
  setImmediate(fn);
};

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBTransaction.js
var prioritizedListenerTypes = ["error", "abort", "complete"];
var FDBTransaction = class extends FakeEventTarget_default {
  _state = "active";
  _started = false;
  _rollbackLog = [];
  _objectStoresCache = /* @__PURE__ */ new Map();
  _openRequest = null;
  error = null;
  onabort = null;
  oncomplete = null;
  onerror = null;
  _prioritizedListeners = /* @__PURE__ */ new Map();
  _requests = [];
  _createdIndexes = /* @__PURE__ */ new Set();
  _createdObjectStores = /* @__PURE__ */ new Set();
  constructor(storeNames, mode, durability, db) {
    super();
    this._scope = new Set(storeNames);
    this.mode = mode;
    this.durability = durability;
    this.db = db;
    this.objectStoreNames = new FakeDOMStringList_default(...Array.from(this._scope).sort());
    for (const type of prioritizedListenerTypes) {
      this.addEventListener(type, () => {
        this._prioritizedListeners.get(type)?.();
      });
    }
  }
  // https://w3c.github.io/IndexedDB/#abort-transaction
  _abort(errName) {
    for (const f of this._rollbackLog.reverse()) {
      f();
    }
    if (errName !== null) {
      const e = new DOMException(void 0, errName);
      this.error = e;
    }
    for (const {
      request
    } of this._requests) {
      if (request.readyState !== "done") {
        request.readyState = "done";
        if (request.source) {
          queueTask(() => {
            request.result = void 0;
            request.error = new AbortError();
            const event = new FakeEvent_default("error", {
              bubbles: true,
              cancelable: true
            });
            event.eventPath = [this.db, this];
            try {
              request.dispatchEvent(event);
            } catch (_err) {
              if (this._state === "active") {
                this._abort("AbortError");
              }
            }
          });
        }
      }
    }
    queueTask(() => {
      const isUpgradeTransaction = this.mode === "versionchange";
      if (isUpgradeTransaction) {
        this.db._rawDatabase.connections = this.db._rawDatabase.connections.filter((connection) => !connection._rawDatabase.transactions.includes(this));
      }
      const event = new FakeEvent_default("abort", {
        bubbles: true,
        cancelable: false
      });
      event.eventPath = [this.db];
      this.dispatchEvent(event);
      if (isUpgradeTransaction) {
        const request = this._openRequest;
        request.transaction = null;
        request.result = void 0;
      }
    });
    this._state = "finished";
  }
  abort() {
    if (this._state === "committing" || this._state === "finished") {
      throw new InvalidStateError();
    }
    this._state = "active";
    this._abort(null);
  }
  // http://w3c.github.io/IndexedDB/#dom-idbtransaction-objectstore
  objectStore(name) {
    if (this._state !== "active") {
      throw new InvalidStateError();
    }
    const objectStore = this._objectStoresCache.get(name);
    if (objectStore !== void 0) {
      return objectStore;
    }
    const rawObjectStore = this.db._rawDatabase.rawObjectStores.get(name);
    if (!this._scope.has(name) || rawObjectStore === void 0) {
      throw new NotFoundError();
    }
    const objectStore2 = new FDBObjectStore_default(this, rawObjectStore);
    this._objectStoresCache.set(name, objectStore2);
    return objectStore2;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-asynchronously-executing-a-request
  _execRequestAsync(obj) {
    const source = obj.source;
    const operation = obj.operation;
    let request = Object.hasOwn(obj, "request") ? obj.request : null;
    if (this._state !== "active") {
      throw new TransactionInactiveError();
    }
    if (!request) {
      if (!source) {
        request = new FDBRequest_default();
      } else {
        request = new FDBRequest_default();
        request.source = source;
        request.transaction = source.transaction;
      }
    }
    this._requests.push({
      operation,
      request
    });
    return request;
  }
  _start() {
    this._started = true;
    let operation;
    let request;
    while (this._requests.length > 0) {
      const r = this._requests.shift();
      if (r && r.request.readyState !== "done") {
        request = r.request;
        operation = r.operation;
        break;
      }
    }
    if (request && operation) {
      if (!request.source) {
        operation();
      } else {
        let defaultAction;
        let event;
        try {
          const result = operation();
          request.readyState = "done";
          request.result = result;
          request.error = void 0;
          if (this._state === "inactive") {
            this._state = "active";
          }
          event = new FakeEvent_default("success", {
            bubbles: false,
            cancelable: false
          });
        } catch (err) {
          request.readyState = "done";
          request.result = void 0;
          request.error = err;
          if (this._state === "inactive") {
            this._state = "active";
          }
          event = new FakeEvent_default("error", {
            bubbles: true,
            cancelable: true
          });
          defaultAction = this._abort.bind(this, err.name);
        }
        try {
          event.eventPath = [this.db, this];
          request.dispatchEvent(event);
        } catch (_err) {
          if (this._state === "active") {
            this._abort("AbortError");
            defaultAction = void 0;
          }
        }
        if (!event.canceled) {
          if (defaultAction) {
            defaultAction();
          }
        }
      }
      queueTask(this._start.bind(this));
      return;
    }
    if (this._state !== "finished") {
      this._state = "finished";
      if (!this.error) {
        const event = new FakeEvent_default("complete");
        this.dispatchEvent(event);
      }
    }
  }
  commit() {
    if (this._state !== "active") {
      throw new InvalidStateError();
    }
    this._state = "committing";
  }
  get [Symbol.toStringTag]() {
    return "IDBTransaction";
  }
};
var FDBTransaction_default = FDBTransaction;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/KeyGenerator.js
var MAX_KEY = 9007199254740992;
var KeyGenerator = class {
  // This is kind of wrong. Should start at 1 and increment only after record is saved
  num = 0;
  next() {
    if (this.num >= MAX_KEY) {
      throw new ConstraintError();
    }
    this.num += 1;
    return this.num;
  }
  // https://w3c.github.io/IndexedDB/#possibly-update-the-key-generator
  setIfLarger(num) {
    const value = Math.floor(Math.min(num, MAX_KEY)) - 1;
    if (value >= this.num) {
      this.num = value + 1;
    }
  }
};
var KeyGenerator_default = KeyGenerator;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/ObjectStore.js
var ObjectStore = class {
  deleted = false;
  records = new RecordStore_default(true);
  rawIndexes = /* @__PURE__ */ new Map();
  constructor(rawDatabase, name, keyPath, autoIncrement) {
    this.rawDatabase = rawDatabase;
    this.keyGenerator = autoIncrement === true ? new KeyGenerator_default() : null;
    this.deleted = false;
    this.name = name;
    this.keyPath = keyPath;
    this.autoIncrement = autoIncrement;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-retrieving-a-value-from-an-object-store
  getKey(key) {
    const record = this.records.get(key);
    return record !== void 0 ? structuredClone(record.key) : void 0;
  }
  // http://w3c.github.io/IndexedDB/#retrieve-multiple-keys-from-an-object-store
  getAllKeys(range, count, direction) {
    if (count === void 0 || count === 0) {
      count = Infinity;
    }
    const records = [];
    for (const record of this.records.values(range, direction)) {
      records.push(structuredClone(record.key));
      if (records.length >= count) {
        break;
      }
    }
    return records;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-retrieving-a-value-from-an-object-store
  getValue(key) {
    const record = this.records.get(key);
    return record !== void 0 ? structuredClone(record.value) : void 0;
  }
  // http://w3c.github.io/IndexedDB/#retrieve-multiple-values-from-an-object-store
  getAllValues(range, count, direction) {
    if (count === void 0 || count === 0) {
      count = Infinity;
    }
    const records = [];
    for (const record of this.records.values(range, direction)) {
      records.push(structuredClone(record.value));
      if (records.length >= count) {
        break;
      }
    }
    return records;
  }
  // https://www.w3.org/TR/IndexedDB/#dom-idbobjectstore-getallrecords
  getAllRecords(range, count, direction) {
    if (count === void 0 || count === 0) {
      count = Infinity;
    }
    const records = [];
    for (const record of this.records.values(range, direction)) {
      records.push(new FDBRecord_default(structuredClone(record.key), structuredClone(record.key), structuredClone(record.value)));
      if (records.length >= count) {
        break;
      }
    }
    return records;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-storing-a-record-into-an-object-store
  storeRecord(newRecord, noOverwrite, rollbackLog) {
    if (this.keyPath !== null) {
      const key = extractKey_default(this.keyPath, newRecord.value).key;
      if (key !== void 0) {
        newRecord.key = key;
      }
    }
    const rollbackLogForThisOperation = [];
    if (this.keyGenerator !== null && newRecord.key === void 0) {
      let rolledBack2 = false;
      const keyGeneratorBefore = this.keyGenerator.num;
      const rollbackKeyGenerator = () => {
        if (rolledBack2) {
          return;
        }
        rolledBack2 = true;
        if (this.keyGenerator) {
          this.keyGenerator.num = keyGeneratorBefore;
        }
      };
      rollbackLogForThisOperation.push(rollbackKeyGenerator);
      if (rollbackLog) {
        rollbackLog.push(rollbackKeyGenerator);
      }
      newRecord.key = this.keyGenerator.next();
      if (this.keyPath !== null) {
        if (Array.isArray(this.keyPath)) {
          throw new Error("Cannot have an array key path in an object store with a key generator");
        }
        let remainingKeyPath = this.keyPath;
        let object = newRecord.value;
        let identifier;
        let i = 0;
        while (i >= 0) {
          if (typeof object !== "object") {
            throw new DataError();
          }
          i = remainingKeyPath.indexOf(".");
          if (i >= 0) {
            identifier = remainingKeyPath.slice(0, i);
            remainingKeyPath = remainingKeyPath.slice(i + 1);
            if (!Object.hasOwn(object, identifier)) {
              Object.defineProperty(object, identifier, {
                configurable: true,
                enumerable: true,
                writable: true,
                value: {}
              });
            }
            object = object[identifier];
          }
        }
        identifier = remainingKeyPath;
        Object.defineProperty(object, identifier, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: newRecord.key
        });
      }
    } else if (this.keyGenerator !== null && typeof newRecord.key === "number") {
      this.keyGenerator.setIfLarger(newRecord.key);
    }
    const existingRecord = this.records.put(newRecord, noOverwrite);
    let rolledBack = false;
    const rollbackStoreRecord = () => {
      if (rolledBack) {
        return;
      }
      rolledBack = true;
      if (existingRecord) {
        this.storeRecord(existingRecord, false);
      } else {
        this.deleteRecord(newRecord.key);
      }
    };
    rollbackLogForThisOperation.push(rollbackStoreRecord);
    if (rollbackLog) {
      rollbackLog.push(rollbackStoreRecord);
    }
    if (existingRecord) {
      for (const rawIndex of this.rawIndexes.values()) {
        rawIndex.records.deleteByValue(newRecord.key);
      }
    }
    try {
      for (const rawIndex of this.rawIndexes.values()) {
        if (rawIndex.initialized) {
          rawIndex.storeRecord(newRecord);
        }
      }
    } catch (err) {
      if (err.name === "ConstraintError") {
        for (const rollback of rollbackLogForThisOperation) {
          rollback();
        }
      }
      throw err;
    }
    return newRecord.key;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-deleting-records-from-an-object-store
  deleteRecord(key, rollbackLog) {
    const deletedRecords = this.records.delete(key);
    if (rollbackLog) {
      for (const record of deletedRecords) {
        rollbackLog.push(() => {
          this.storeRecord(record, true);
        });
      }
    }
    for (const rawIndex of this.rawIndexes.values()) {
      rawIndex.records.deleteByValue(key);
    }
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-clearing-an-object-store
  clear(rollbackLog) {
    const deletedRecords = this.records.clear();
    if (rollbackLog) {
      for (const record of deletedRecords) {
        rollbackLog.push(() => {
          this.storeRecord(record, true);
        });
      }
    }
    for (const rawIndex of this.rawIndexes.values()) {
      rawIndex.records.clear();
    }
  }
  count(range) {
    if (range === void 0 || range.lower === void 0 && range.upper === void 0) {
      return this.records.size();
    }
    let count = 0;
    for (const record of this.records.values(range)) {
      count += 1;
    }
    return count;
  }
};
var ObjectStore_default = ObjectStore;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/closeConnection.js
var closeConnection = (connection, forced = false) => {
  connection._closePending = true;
  const transactionsComplete = connection._rawDatabase.transactions.every((transaction) => {
    return transaction._state === "finished";
  });
  if (transactionsComplete) {
    connection._closed = true;
    connection._rawDatabase.connections = connection._rawDatabase.connections.filter((otherConnection) => {
      return connection !== otherConnection;
    });
    if (forced) {
      const event = new FakeEvent_default("close", {
        bubbles: false,
        cancelable: false
      });
      event.eventPath = [];
      connection.dispatchEvent(event);
    }
  } else {
    queueTask(() => {
      closeConnection(connection, forced);
    });
  }
};
var closeConnection_default = closeConnection;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBDatabase.js
var confirmActiveVersionchangeTransaction = (database) => {
  let transaction;
  if (database._runningVersionchangeTransaction) {
    transaction = database._rawDatabase.transactions.findLast((tx) => {
      return tx.mode === "versionchange";
    });
  }
  if (!transaction) {
    throw new InvalidStateError();
  }
  if (transaction._state !== "active") {
    throw new TransactionInactiveError();
  }
  return transaction;
};
var FDBDatabase = class extends FakeEventTarget_default {
  _closePending = false;
  _closed = false;
  _runningVersionchangeTransaction = false;
  constructor(rawDatabase) {
    super();
    this._rawDatabase = rawDatabase;
    this._rawDatabase.connections.push(this);
    this.name = rawDatabase.name;
    this.version = rawDatabase.version;
    this.objectStoreNames = new FakeDOMStringList_default(...Array.from(rawDatabase.rawObjectStores.keys()).sort());
  }
  // http://w3c.github.io/IndexedDB/#dom-idbdatabase-createobjectstore
  createObjectStore(name, options = {}) {
    if (name === void 0) {
      throw new TypeError();
    }
    const transaction = confirmActiveVersionchangeTransaction(this);
    const keyPath = options !== null && options.keyPath !== void 0 ? options.keyPath : null;
    const autoIncrement = options !== null && options.autoIncrement !== void 0 ? options.autoIncrement : false;
    if (keyPath !== null) {
      validateKeyPath_default(keyPath);
    }
    if (this._rawDatabase.rawObjectStores.has(name)) {
      throw new ConstraintError();
    }
    if (autoIncrement && (keyPath === "" || Array.isArray(keyPath))) {
      throw new InvalidAccessError();
    }
    const objectStoreNames = [...this.objectStoreNames];
    const transactionObjectStoreNames = [...transaction.objectStoreNames];
    const rawObjectStore = new ObjectStore_default(this._rawDatabase, name, keyPath, autoIncrement);
    this.objectStoreNames._push(name);
    this.objectStoreNames._sort();
    transaction._scope.add(name);
    transaction._createdObjectStores.add(rawObjectStore);
    this._rawDatabase.rawObjectStores.set(name, rawObjectStore);
    transaction.objectStoreNames = new FakeDOMStringList_default(...this.objectStoreNames);
    transaction._rollbackLog.push(() => {
      rawObjectStore.deleted = true;
      this.objectStoreNames = new FakeDOMStringList_default(...objectStoreNames);
      transaction.objectStoreNames = new FakeDOMStringList_default(...transactionObjectStoreNames);
      transaction._scope.delete(rawObjectStore.name);
      this._rawDatabase.rawObjectStores.delete(rawObjectStore.name);
    });
    return transaction.objectStore(name);
  }
  // https://www.w3.org/TR/IndexedDB/#dom-idbdatabase-deleteobjectstore
  deleteObjectStore(name) {
    if (name === void 0) {
      throw new TypeError();
    }
    const transaction = confirmActiveVersionchangeTransaction(this);
    const store2 = this._rawDatabase.rawObjectStores.get(name);
    if (store2 === void 0) {
      throw new NotFoundError();
    }
    this.objectStoreNames = new FakeDOMStringList_default(...Array.from(this.objectStoreNames).filter((objectStoreName) => {
      return objectStoreName !== name;
    }));
    transaction.objectStoreNames = new FakeDOMStringList_default(...this.objectStoreNames);
    const objectStore = transaction._objectStoresCache.get(name);
    let prevIndexNames;
    if (objectStore) {
      prevIndexNames = [...objectStore.indexNames];
      objectStore.indexNames = new FakeDOMStringList_default();
    }
    transaction._rollbackLog.push(() => {
      store2.deleted = false;
      this._rawDatabase.rawObjectStores.set(store2.name, store2);
      this.objectStoreNames._push(store2.name);
      transaction.objectStoreNames._push(store2.name);
      this.objectStoreNames._sort();
      if (objectStore && prevIndexNames) {
        objectStore.indexNames = new FakeDOMStringList_default(...prevIndexNames);
      }
    });
    store2.deleted = true;
    this._rawDatabase.rawObjectStores.delete(name);
    transaction._objectStoresCache.delete(name);
  }
  transaction(storeNames, mode, options) {
    mode = mode !== void 0 ? mode : "readonly";
    if (mode !== "readonly" && mode !== "readwrite" && mode !== "versionchange") {
      throw new TypeError("Invalid mode: " + mode);
    }
    const hasActiveVersionchange = this._rawDatabase.transactions.some((transaction) => {
      return transaction._state === "active" && transaction.mode === "versionchange" && transaction.db === this;
    });
    if (hasActiveVersionchange) {
      throw new InvalidStateError();
    }
    if (this._closePending) {
      throw new InvalidStateError();
    }
    if (!Array.isArray(storeNames)) {
      storeNames = [storeNames];
    }
    if (storeNames.length === 0 && mode !== "versionchange") {
      throw new InvalidAccessError();
    }
    for (const storeName of storeNames) {
      if (!this.objectStoreNames.contains(storeName)) {
        throw new NotFoundError("No objectStore named " + storeName + " in this database");
      }
    }
    const durability = options?.durability ?? "default";
    if (durability !== "default" && durability !== "strict" && durability !== "relaxed") {
      throw new TypeError(
        // based on Firefox's error message
        `'${durability}' (value of 'durability' member of IDBTransactionOptions) is not a valid value for enumeration IDBTransactionDurability`
      );
    }
    const tx = new FDBTransaction_default(storeNames, mode, durability, this);
    this._rawDatabase.transactions.push(tx);
    this._rawDatabase.processTransactions();
    return tx;
  }
  close() {
    closeConnection_default(this);
  }
  get [Symbol.toStringTag]() {
    return "IDBDatabase";
  }
};
var FDBDatabase_default = FDBDatabase;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBOpenDBRequest.js
var FDBOpenDBRequest = class extends FDBRequest_default {
  onupgradeneeded = null;
  onblocked = null;
  get [Symbol.toStringTag]() {
    return "IDBOpenDBRequest";
  }
};
var FDBOpenDBRequest_default = FDBOpenDBRequest;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBVersionChangeEvent.js
var FDBVersionChangeEvent = class extends FakeEvent_default {
  constructor(type, parameters = {}) {
    super(type);
    this.newVersion = parameters.newVersion !== void 0 ? parameters.newVersion : null;
    this.oldVersion = parameters.oldVersion !== void 0 ? parameters.oldVersion : 0;
  }
  get [Symbol.toStringTag]() {
    return "IDBVersionChangeEvent";
  }
};
var FDBVersionChangeEvent_default = FDBVersionChangeEvent;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/intersection.js
function intersection(set1, set2) {
  if ("intersection" in set1) {
    return set1.intersection(set2);
  }
  return new Set([...set1].filter((item) => set2.has(item)));
}

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/Database.js
var Database = class {
  transactions = [];
  rawObjectStores = /* @__PURE__ */ new Map();
  connections = [];
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.processTransactions = this.processTransactions.bind(this);
  }
  processTransactions() {
    queueTask(() => {
      const running = this.transactions.filter((transaction) => transaction._started && transaction._state !== "finished");
      const waiting = this.transactions.filter((transaction) => !transaction._started && transaction._state !== "finished");
      const next = waiting.find((transaction, i) => {
        const anyRunning = running.some((other) => !(transaction.mode === "readonly" && other.mode === "readonly") && intersection(other._scope, transaction._scope).size > 0);
        if (anyRunning) {
          return false;
        }
        const anyWaiting = waiting.slice(0, i).some((other) => intersection(other._scope, transaction._scope).size > 0);
        return !anyWaiting;
      });
      if (next) {
        next.addEventListener("complete", this.processTransactions);
        next.addEventListener("abort", this.processTransactions);
        next._start();
      }
    });
  }
};
var Database_default = Database;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/lib/validateRequiredArguments.js
function validateRequiredArguments(numArguments, expectedNumArguments, methodName) {
  if (numArguments < expectedNumArguments) {
    throw new TypeError(`${methodName}: At least ${expectedNumArguments} ${expectedNumArguments === 1 ? "argument" : "arguments"} required, but only ${arguments.length} passed`);
  }
}

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/FDBFactory.js
var runTaskInConnectionQueue = (connectionQueues, name, task) => {
  const queue = connectionQueues.get(name) ?? Promise.resolve();
  connectionQueues.set(name, queue.then(task));
};
var waitForOthersClosedDelete = (databases, name, openDatabases, cb) => {
  const anyOpen = openDatabases.some((openDatabase2) => {
    return !openDatabase2._closed && !openDatabase2._closePending;
  });
  if (anyOpen) {
    queueTask(() => waitForOthersClosedDelete(databases, name, openDatabases, cb));
    return;
  }
  databases.delete(name);
  cb(null);
};
var deleteDatabase = (databases, connectionQueues, name, request, cb) => {
  const deleteDBTask = () => {
    return new Promise((resolve) => {
      const db = databases.get(name);
      const oldVersion = db !== void 0 ? db.version : 0;
      const onComplete = (err) => {
        try {
          if (err) {
            cb(err);
          } else {
            cb(null, oldVersion);
          }
        } finally {
          resolve();
        }
      };
      try {
        const db2 = databases.get(name);
        if (db2 === void 0) {
          onComplete(null);
          return;
        }
        const openConnections = db2.connections.filter((connection) => {
          return !connection._closed;
        });
        for (const openDatabase2 of openConnections) {
          if (!openDatabase2._closePending) {
            queueTask(() => {
              const event = new FDBVersionChangeEvent_default("versionchange", {
                newVersion: null,
                oldVersion: db2.version
              });
              openDatabase2.dispatchEvent(event);
            });
          }
        }
        queueTask(() => {
          const anyOpen = openConnections.some((openDatabase3) => {
            return !openDatabase3._closed && !openDatabase3._closePending;
          });
          if (anyOpen) {
            queueTask(() => {
              const event = new FDBVersionChangeEvent_default("blocked", {
                newVersion: null,
                oldVersion: db2.version
              });
              request.dispatchEvent(event);
            });
          }
          waitForOthersClosedDelete(databases, name, openConnections, onComplete);
        });
      } catch (err) {
        onComplete(err);
      }
    });
  };
  runTaskInConnectionQueue(connectionQueues, name, deleteDBTask);
};
var runVersionchangeTransaction = (connection, version, request, cb) => {
  connection._runningVersionchangeTransaction = true;
  const oldVersion = connection._oldVersion = connection.version;
  const openConnections = connection._rawDatabase.connections.filter((otherDatabase) => {
    return connection !== otherDatabase;
  });
  for (const openDatabase2 of openConnections) {
    if (!openDatabase2._closed && !openDatabase2._closePending) {
      queueTask(() => {
        const event = new FDBVersionChangeEvent_default("versionchange", {
          newVersion: version,
          oldVersion
        });
        openDatabase2.dispatchEvent(event);
      });
    }
  }
  queueTask(() => {
    const anyOpen = openConnections.some((openDatabase3) => {
      return !openDatabase3._closed && !openDatabase3._closePending;
    });
    if (anyOpen) {
      queueTask(() => {
        const event = new FDBVersionChangeEvent_default("blocked", {
          newVersion: version,
          oldVersion
        });
        request.dispatchEvent(event);
      });
    }
    const waitForOthersClosed = () => {
      const anyOpen2 = openConnections.some((openDatabase2) => {
        return !openDatabase2._closed && !openDatabase2._closePending;
      });
      if (anyOpen2) {
        queueTask(waitForOthersClosed);
        return;
      }
      connection._rawDatabase.version = version;
      connection.version = version;
      const transaction = connection.transaction(Array.from(connection.objectStoreNames), "versionchange");
      transaction._openRequest = request;
      request.result = connection;
      request.readyState = "done";
      request.transaction = transaction;
      transaction._rollbackLog.push(() => {
        connection._rawDatabase.version = oldVersion;
        connection.version = oldVersion;
      });
      transaction._state = "active";
      const event = new FDBVersionChangeEvent_default("upgradeneeded", {
        newVersion: version,
        oldVersion
      });
      let didThrow = false;
      try {
        request.dispatchEvent(event);
      } catch (_err) {
        didThrow = true;
      }
      const concludeUpgrade = () => {
        if (transaction._state === "active") {
          transaction._state = "inactive";
          if (didThrow) {
            transaction._abort("AbortError");
          }
        }
      };
      if (didThrow) {
        concludeUpgrade();
      } else {
        queueTask(concludeUpgrade);
      }
      transaction._prioritizedListeners.set("error", () => {
        connection._runningVersionchangeTransaction = false;
        connection._oldVersion = void 0;
      });
      transaction._prioritizedListeners.set("abort", () => {
        connection._runningVersionchangeTransaction = false;
        connection._oldVersion = void 0;
        queueTask(() => {
          request.transaction = null;
          cb(new AbortError());
        });
      });
      transaction._prioritizedListeners.set("complete", () => {
        connection._runningVersionchangeTransaction = false;
        connection._oldVersion = void 0;
        queueTask(() => {
          request.transaction = null;
          if (connection._closePending) {
            cb(new AbortError());
          } else {
            cb(null);
          }
        });
      });
    };
    waitForOthersClosed();
  });
};
var openDatabase = (databases, connectionQueues, name, version, request, cb) => {
  const openDBTask = () => {
    return new Promise((resolve) => {
      const onComplete = (err) => {
        try {
          if (err) {
            cb(err);
          } else {
            cb(null, connection);
          }
        } finally {
          resolve();
        }
      };
      let db = databases.get(name);
      if (db === void 0) {
        db = new Database_default(name, 0);
        databases.set(name, db);
      }
      if (version === void 0) {
        version = db.version !== 0 ? db.version : 1;
      }
      if (db.version > version) {
        return onComplete(new VersionError());
      }
      const connection = new FDBDatabase_default(db);
      if (db.version < version) {
        runVersionchangeTransaction(connection, version, request, (err) => {
          onComplete(err);
        });
      } else {
        onComplete(null);
      }
    });
  };
  runTaskInConnectionQueue(connectionQueues, name, openDBTask);
};
var FDBFactory = class {
  _databases = /* @__PURE__ */ new Map();
  // https://w3c.github.io/IndexedDB/#connection-queue
  _connectionQueues = /* @__PURE__ */ new Map();
  // promise chain as lightweight FIFO task queue
  // https://w3c.github.io/IndexedDB/#dom-idbfactory-cmp
  cmp(first, second) {
    validateRequiredArguments(arguments.length, 2, "IDBFactory.cmp");
    return cmp_default(first, second);
  }
  // https://w3c.github.io/IndexedDB/#dom-idbfactory-deletedatabase
  deleteDatabase(name) {
    validateRequiredArguments(arguments.length, 1, "IDBFactory.deleteDatabase");
    const request = new FDBOpenDBRequest_default();
    request.source = null;
    queueTask(() => {
      deleteDatabase(this._databases, this._connectionQueues, name, request, (err, oldVersion) => {
        if (err) {
          request.error = new DOMException(err.message, err.name);
          request.readyState = "done";
          const event = new FakeEvent_default("error", {
            bubbles: true,
            cancelable: true
          });
          event.eventPath = [];
          request.dispatchEvent(event);
          return;
        }
        request.result = void 0;
        request.readyState = "done";
        const event2 = new FDBVersionChangeEvent_default("success", {
          newVersion: null,
          oldVersion
        });
        request.dispatchEvent(event2);
      });
    });
    return request;
  }
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBFactory-open-IDBOpenDBRequest-DOMString-name-unsigned-long-long-version
  open(name, version) {
    validateRequiredArguments(arguments.length, 1, "IDBFactory.open");
    if (arguments.length > 1 && version !== void 0) {
      version = enforceRange_default(version, "MAX_SAFE_INTEGER");
    }
    if (version === 0) {
      throw new TypeError("Database version cannot be 0");
    }
    const request = new FDBOpenDBRequest_default();
    request.source = null;
    queueTask(() => {
      openDatabase(this._databases, this._connectionQueues, name, version, request, (err, connection) => {
        if (err) {
          request.result = void 0;
          request.readyState = "done";
          request.error = new DOMException(err.message, err.name);
          const event = new FakeEvent_default("error", {
            bubbles: true,
            cancelable: true
          });
          event.eventPath = [];
          request.dispatchEvent(event);
          return;
        }
        request.result = connection;
        request.readyState = "done";
        const event2 = new FakeEvent_default("success");
        event2.eventPath = [];
        request.dispatchEvent(event2);
      });
    });
    return request;
  }
  // https://w3c.github.io/IndexedDB/#dom-idbfactory-databases
  databases() {
    return Promise.resolve(Array.from(this._databases.entries(), ([name, database]) => {
      const activeVersionChangeConnection = database.connections.find((connection) => connection._runningVersionchangeTransaction);
      const version = activeVersionChangeConnection ? activeVersionChangeConnection._oldVersion : database.version;
      return {
        name,
        version
      };
    }).filter(({
      version
    }) => {
      return version > 0;
    }));
  }
  get [Symbol.toStringTag]() {
    return "IDBFactory";
  }
};
var FDBFactory_default = FDBFactory;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/build/esm/fakeIndexedDB.js
var fakeIndexedDB = new FDBFactory_default();
var fakeIndexedDB_default = fakeIndexedDB;

// node_modules/.pnpm/fake-indexeddb@6.2.5/node_modules/fake-indexeddb/auto/index.mjs
var globalVar = typeof window !== "undefined" ? window : typeof WorkerGlobalScope !== "undefined" ? self : typeof global !== "undefined" ? global : Function("return this;")();
var createPropertyDescriptor = (value) => {
  return {
    value,
    enumerable: false,
    configurable: true,
    writable: true
  };
};
Object.defineProperties(globalVar, {
  indexedDB: createPropertyDescriptor(fakeIndexedDB_default),
  IDBCursor: createPropertyDescriptor(FDBCursor_default),
  IDBCursorWithValue: createPropertyDescriptor(FDBCursorWithValue_default),
  IDBDatabase: createPropertyDescriptor(FDBDatabase_default),
  IDBFactory: createPropertyDescriptor(FDBFactory_default),
  IDBIndex: createPropertyDescriptor(FDBIndex_default),
  IDBKeyRange: createPropertyDescriptor(FDBKeyRange_default),
  IDBObjectStore: createPropertyDescriptor(FDBObjectStore_default),
  IDBOpenDBRequest: createPropertyDescriptor(FDBOpenDBRequest_default),
  IDBRecord: createPropertyDescriptor(FDBRecord_default),
  IDBRequest: createPropertyDescriptor(FDBRequest_default),
  IDBTransaction: createPropertyDescriptor(FDBTransaction_default),
  IDBVersionChangeEvent: createPropertyDescriptor(FDBVersionChangeEvent_default)
});

// .arx/evidence/saber/TASK-231/backend/repro-entry.ts
init_keys();

// src/lib/wallet/seed.ts
init_encrypt();
init_keys();

// src/lib/storage/local.ts
var KEYS = {
  WALLET_META: "lnwcash_wallet_meta",
  SETTINGS: "lnwcash_settings",
  KEYSET_CACHE: "lnwcash_keyset_cache"
};
function isLocalStorageAvailable() {
  try {
    const testKey = "__lnwcash_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}
function readJSON(key, fallback) {
  if (!isLocalStorageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    console.warn(`[localStorage] Failed to read key: ${key}`);
    return fallback;
  }
}
function writeJSON(key, value) {
  if (!isLocalStorageAvailable()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    console.warn(`[localStorage] Failed to write key: ${key}`);
    return false;
  }
}
function removeKey(key) {
  if (!isLocalStorageAvailable()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
function setWalletMetadata(meta) {
  return writeJSON(KEYS.WALLET_META, meta);
}
function clearWalletMetadata() {
  return removeKey(KEYS.WALLET_META);
}
function getKeysetCache(mintUrl) {
  const cache = readJSON(KEYS.KEYSET_CACHE, {});
  return cache[mintUrl] ?? [];
}
function setKeysetCache(mintUrl, keysets) {
  const cache = readJSON(KEYS.KEYSET_CACHE, {});
  cache[mintUrl] = keysets;
  return writeJSON(KEYS.KEYSET_CACHE, cache);
}

// src/lib/platform.ts
function isNativePlatform() {
  try {
    if (typeof window === "undefined") return false;
    const Capacitor = window.Capacitor;
    return Capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

// src/lib/wallet/storage.ts
var KEYS2 = {
  ENCRYPTED_KEY: "lnwcash_encrypted_key",
  ENCRYPTED_MNEMONIC: "lnwcash_encrypted_mnemonic",
  PIN_HASH: "lnwcash_pin_hash",
  WALLET_STATE: "lnwcash_wallet_state"
};
function readJSON2(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeJSON2(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn("[wallet-storage] Failed to write:", key);
  }
}
function removeKey2(key) {
  try {
    localStorage.removeItem(key);
  } catch {
  }
}
var _secureStorageLoaded = false;
var _securePlugin = null;
async function _loadSecurePlugin() {
  if (_secureStorageLoaded) return;
  _secureStorageLoaded = true;
  if (!isNativePlatform()) return;
  try {
    const mod2 = await Promise.resolve().then(() => __toESM(require_plugin_cjs(), 1));
    _securePlugin = mod2.SecureStoragePlugin;
  } catch {
  }
}
function _shortKey(key) {
  if (key === KEYS2.ENCRYPTED_KEY) return "encrypted_key";
  if (key === KEYS2.ENCRYPTED_MNEMONIC) return "encrypted_mnemonic";
  if (key === KEYS2.PIN_HASH) return "pin_hash";
  if (key === KEYS2.WALLET_STATE) return "wallet_state";
  return key.replace("lnwcash_", "");
}
async function _mirrorToSecure(key, value) {
  await _loadSecurePlugin();
  if (!_securePlugin) return;
  try {
    await _securePlugin.set({ key: _shortKey(key), value });
  } catch {
  }
}
async function _removeFromSecure(key) {
  await _loadSecurePlugin();
  if (!_securePlugin) return;
  try {
    await _securePlugin.remove({ key: _shortKey(key) });
  } catch {
  }
}
function getEncryptedKey() {
  const data = readJSON2(KEYS2.ENCRYPTED_KEY, null);
  if (!data && isNativePlatform()) {
    _loadSecurePlugin().then(() => {
      if (_securePlugin) {
        _securePlugin.get({ key: "encrypted_key" }).then((result) => {
          if (result.value) {
            try {
              const parsed = JSON.parse(result.value);
              writeJSON2(KEYS2.ENCRYPTED_KEY, parsed);
            } catch {
            }
          }
        }).catch(() => {
        });
      }
    });
  }
  return data;
}
function setEncryptedKey(key) {
  writeJSON2(KEYS2.ENCRYPTED_KEY, key);
  _mirrorToSecure(KEYS2.ENCRYPTED_KEY, JSON.stringify(key));
}
function clearEncryptedKey() {
  removeKey2(KEYS2.ENCRYPTED_KEY);
  _removeFromSecure(KEYS2.ENCRYPTED_KEY);
}
function getEncryptedMnemonic() {
  return readJSON2(KEYS2.ENCRYPTED_MNEMONIC, null);
}
function setEncryptedMnemonic(key) {
  writeJSON2(KEYS2.ENCRYPTED_MNEMONIC, key);
  _mirrorToSecure(KEYS2.ENCRYPTED_MNEMONIC, JSON.stringify(key));
}
function clearEncryptedMnemonic() {
  removeKey2(KEYS2.ENCRYPTED_MNEMONIC);
  _removeFromSecure(KEYS2.ENCRYPTED_MNEMONIC);
}
function getPinHash() {
  return readJSON2(KEYS2.PIN_HASH, null);
}
function setPinHash(hash) {
  writeJSON2(KEYS2.PIN_HASH, hash);
  _mirrorToSecure(KEYS2.PIN_HASH, JSON.stringify(hash));
}
function clearPinHash() {
  removeKey2(KEYS2.PIN_HASH);
  _removeFromSecure(KEYS2.PIN_HASH);
}
function getWalletState() {
  const stored = readJSON2(KEYS2.WALLET_STATE, null);
  return stored?.state ?? "UNINITIALIZED";
}
function setWalletState(state) {
  writeJSON2(KEYS2.WALLET_STATE, {
    state,
    last_updated: Date.now()
  });
}
function clearWalletState() {
  removeKey2(KEYS2.WALLET_STATE);
}
async function clearAllWalletData() {
  clearEncryptedKey();
  clearEncryptedMnemonic();
  clearPinHash();
  clearWalletState();
  clearWalletMetadata();
  try {
    const { deleteProofDB: deleteProofDB2 } = await Promise.resolve().then(() => (init_proofsDb(), proofsDb_exports));
    await deleteProofDB2();
  } catch {
  }
}

// src/lib/wallet/errors.ts
var WalletError = class extends Error {
  key;
  constructor(message, key) {
    super(message);
    this.name = "WalletError";
    this.key = key;
  }
};
var InvalidPinError = class extends WalletError {
  constructor() {
    super("Invalid PIN", "error.invalid_pin");
    this.name = "InvalidPinError";
  }
};
var WalletLockedError = class extends WalletError {
  constructor() {
    super("Wallet is locked \u2014 call unlockWallet() first", "error.wallet_locked");
    this.name = "WalletLockedError";
  }
};
var WalletNotInitializedError = class extends WalletError {
  constructor() {
    super("Wallet not initialized \u2014 call createWallet() first", "error.wallet_not_initialized");
    this.name = "WalletNotInitializedError";
  }
};
var SeedImportError = class extends WalletError {
  constructor(details) {
    super(`Seed import failed${details ? `: ${details}` : ""}`, "error.seed_import");
    this.name = "SeedImportError";
  }
};

// src/lib/wallet/seed.ts
async function importSeed(seed, newPin, walletName) {
  if (newPin.length < 4) {
    throw new SeedImportError("PIN must be at least 4 characters");
  }
  const words = seed.trim().toLowerCase().split(/\s+/);
  let privateKey;
  try {
    privateKey = seedToPrivateKey(seed);
  } catch (err) {
    throw new SeedImportError(
      err instanceof Error ? err.message : "Invalid seed phrase"
    );
  }
  const { getPublicKey: getPublicKey2 } = await Promise.resolve().then(() => (init_keys(), keys_exports));
  const publicKey = getPublicKey2(privateKey);
  const pinHashValue = await hashPin(newPin);
  const encryptedKey = await encryptKey(privateKey, newPin);
  setPinHash(pinHashValue);
  setEncryptedKey(encryptedKey);
  if (words.length === BIP39_SEED_WORD_COUNT) {
    const encryptedMnemonic = await encryptKey(words.join(" "), newPin);
    setEncryptedMnemonic(encryptedMnemonic);
  } else {
    clearEncryptedMnemonic();
  }
  setWalletMetadata({ name: walletName, created_at: Date.now() });
  setWalletState("LOCKED");
  return { publicKey };
}

// src/lib/wallet/state.ts
init_encrypt();
init_keys();

// node_modules/.pnpm/@scure+bip32@2.3.0/node_modules/@scure/bip32/index.js
init_secp256k1();
init_hmac();

// node_modules/.pnpm/@noble+hashes@2.3.0/node_modules/@noble/hashes/legacy.js
init_md();
init_utils();
var Rho160 = /* @__PURE__ */ Uint8Array.from([
  7,
  4,
  13,
  1,
  10,
  6,
  15,
  3,
  12,
  0,
  9,
  5,
  2,
  14,
  11,
  8
]);
var Id160 = /* @__PURE__ */ (() => Uint8Array.from(new Array(16).fill(0).map((_, i) => i)))();
var Pi160 = /* @__PURE__ */ (() => Id160.map((i) => (9 * i + 5) % 16))();
var idxLR = /* @__PURE__ */ (() => {
  const L = [Id160];
  const R = [Pi160];
  const res = [L, R];
  for (let i = 0; i < 4; i++)
    for (let j of res)
      j.push(j[i].map((k2) => Rho160[k2]));
  return res;
})();
var idxL = /* @__PURE__ */ (() => idxLR[0])();
var idxR = /* @__PURE__ */ (() => idxLR[1])();
var shifts160 = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((i) => Uint8Array.from(i));
var shiftsL160 = /* @__PURE__ */ idxL.map((idx, i) => idx.map((j) => shifts160[i][j]));
var shiftsR160 = /* @__PURE__ */ idxR.map((idx, i) => idx.map((j) => shifts160[i][j]));
var Kl160 = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]);
var Kr160 = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function ripemd_f(group, x, y, z) {
  if (group === 0)
    return x ^ y ^ z;
  if (group === 1)
    return x & y | ~x & z;
  if (group === 2)
    return (x | ~y) ^ z;
  if (group === 3)
    return x & z | y & ~z;
  return x ^ (y | ~z);
}
var BUF_160 = /* @__PURE__ */ new Uint32Array(16);
var _RIPEMD160 = class extends HashMD {
  h0 = 1732584193 | 0;
  h1 = 4023233417 | 0;
  h2 = 2562383102 | 0;
  h3 = 271733878 | 0;
  h4 = 3285377520 | 0;
  constructor() {
    super(64, 20, 8, true);
  }
  get() {
    const { h0, h1, h2, h3, h4 } = this;
    return [h0, h1, h2, h3, h4];
  }
  set(h0, h1, h2, h3, h4) {
    this.h0 = h0 | 0;
    this.h1 = h1 | 0;
    this.h2 = h2 | 0;
    this.h3 = h3 | 0;
    this.h4 = h4 | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      BUF_160[i] = view.getUint32(offset, true);
    let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
    for (let group = 0; group < 5; group++) {
      const rGroup = 4 - group;
      const hbl = Kl160[group], hbr = Kr160[group];
      const rl = idxL[group], rr = idxR[group];
      const sl = shiftsL160[group], sr = shiftsR160[group];
      for (let i = 0; i < 16; i++) {
        const tl = rotl(al + ripemd_f(group, bl, cl, dl) + BUF_160[rl[i]] + hbl, sl[i]) + el | 0;
        al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl;
      }
      for (let i = 0; i < 16; i++) {
        const tr = rotl(ar + ripemd_f(rGroup, br, cr, dr) + BUF_160[rr[i]] + hbr, sr[i]) + er | 0;
        ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr;
      }
    }
    this.set(this.h1 + cl + dr | 0, this.h2 + dl + er | 0, this.h3 + el + ar | 0, this.h4 + al + br | 0, this.h0 + bl + cr | 0);
  }
  roundClean() {
    clean(BUF_160);
  }
  destroy() {
    this.destroyed = true;
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0);
  }
};
var ripemd160 = /* @__PURE__ */ createHasher(() => new _RIPEMD160());

// node_modules/.pnpm/@scure+bip32@2.3.0/node_modules/@scure/bip32/index.js
init_sha2();
init_utils();

// node_modules/.pnpm/@scure+base@2.3.0/node_modules/@scure/base/index.js
var freeze = (fn) => Object.freeze(fn());
function isBytes3(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function abytes3(b) {
  if (!isBytes3(b))
    throw new TypeError("Uint8Array expected");
}
function afn(input) {
  if (typeof input !== "function")
    throw new TypeError("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new TypeError(`${label}: string expected`);
  return true;
}
function anumber3(n, title = "number") {
  if (typeof n !== "number")
    throw new TypeError(`${title}: expected number, got ${typeof n}`);
  if (!Number.isSafeInteger(n))
    throw new RangeError(`${title}: expected safe integer, got ${n}`);
}
function chain(...args) {
  const id = (a) => a;
  const wrap2 = (a, b) => (c) => a(b(c));
  const encode = args.map((x) => x.encode).reduceRight(wrap2, id);
  const decode = args.map((x) => x.decode).reduce(wrap2, id);
  return { encode, decode };
}
var asciiDecoder = /* @__PURE__ */ (() => {
  try {
    const decoder = new TextDecoder();
    return decoder.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+\x7F" ? decoder : void 0;
  } catch (e) {
    return void 0;
  }
})();
var B2S_CHUNK = 8192;
function charcodesToString(codes) {
  const len = codes.length;
  if (asciiDecoder !== void 0 && len >= 12)
    return asciiDecoder.decode(codes);
  if (len <= B2S_CHUNK)
    return String.fromCharCode.apply(null, codes);
  let res = "";
  for (let i = 0; i < len; i += B2S_CHUNK)
    res += String.fromCharCode.apply(null, codes.subarray(i, i + B2S_CHUNK));
  return res;
}
function alphabet(letters, aliases) {
  const len = letters.length;
  if (len > 128)
    throw new Error("alphabet: max 128 letters");
  const encTable = new Uint8Array(len);
  const decTable = new Int8Array(128).fill(-1);
  for (let i = 0; i < len; i++) {
    const code = letters.charCodeAt(i);
    if (letters.codePointAt(i) !== code || code > 127)
      throw new Error("alphabet: single-char ASCII letters only");
    encTable[i] = code;
    decTable[code] = i;
  }
  if (aliases !== void 0) {
    for (const alias of Object.keys(aliases)) {
      const code = alias.charCodeAt(0);
      const target = decTable[aliases[alias].charCodeAt(0)];
      if (alias.length !== 1 || code > 127 || target === void 0 || target === -1)
        throw new Error(`alphabet: invalid alias ${alias}`);
      decTable[code] = target;
    }
  }
  return {
    encode: (digits) => {
      const codes = new Uint8Array(digits.length);
      for (let i = 0; i < digits.length; i++) {
        const d = digits[i];
        const code = encTable[d];
        if (code === void 0)
          throw new Error(`alphabet.encode: invalid digit ${d}`);
        codes[i] = code;
      }
      return charcodesToString(codes);
    },
    decode: (input) => {
      astr("decode", input);
      const slen = input.length;
      const digits = new Uint8Array(slen);
      for (let i = 0; i < slen; i++) {
        const code = input.charCodeAt(i);
        const digit = code < 128 ? decTable[code] : -1;
        if (digit === -1)
          throw new Error(`Unknown letter "${input[i]}". Allowed: ${letters}`);
        digits[i] = digit;
      }
      return digits;
    }
  };
}
function checksum(len, fn) {
  anumber3(len);
  if (len <= 0)
    throw new RangeError(`checksum length must be positive: ${len}`);
  afn(fn);
  const _fn = fn;
  return {
    encode(data) {
      abytes3(data);
      const sum = _fn(data).slice(0, len);
      const res = new Uint8Array(data.length + len);
      res.set(data);
      res.set(sum, data.length);
      return res;
    },
    decode(data) {
      abytes3(data);
      const payload = data.slice(0, -len);
      const oldChecksum = data.slice(-len);
      const newChecksum = _fn(payload).slice(0, len);
      for (let i = 0; i < len; i++)
        if (newChecksum[i] !== oldChecksum[i])
          throw new Error("Invalid checksum");
      return payload;
    }
  };
}
var B58_GROUP = 656356768;
var radix58 = {
  encode: (bytes) => {
    abytes3(bytes);
    const blen = bytes.length;
    if (blen === 0)
      return new Uint8Array(0);
    let zeros = 0;
    while (zeros < blen - 1 && bytes[zeros] === 0)
      zeros++;
    const nlimbs = Math.ceil(blen / 2);
    const limbs = new Uint16Array(nlimbs);
    const odd = blen & 1;
    if (odd)
      limbs[0] = bytes[0];
    for (let i = odd, j2 = odd; i < blen; i += 2, j2++)
      limbs[j2] = bytes[i] << 8 | bytes[i + 1];
    const groups = [];
    let pos = 0;
    while (pos < nlimbs) {
      let carry = 0;
      for (let i = pos; i < nlimbs; i++) {
        const cur = carry * 65536 + limbs[i];
        const q = Math.floor(cur / B58_GROUP);
        carry = cur - q * B58_GROUP;
        limbs[i] = q;
        if (q === 0 && i === pos)
          pos++;
      }
      groups.push(carry);
    }
    const top = groups.length - 1;
    let sig = top * 5;
    for (let v = groups[top]; ; v = Math.floor(v / 58)) {
      sig++;
      if (v < 58)
        break;
    }
    const res = new Uint8Array(zeros + sig);
    let j = res.length - 1;
    for (let g = 0; g < top; g++) {
      let v = groups[g];
      for (let k2 = 0; k2 < 5; k2++) {
        res[j--] = v % 58;
        v = Math.floor(v / 58);
      }
    }
    for (let v = groups[top]; j >= zeros; v = Math.floor(v / 58))
      res[j--] = v % 58;
    return res;
  },
  decode: (digits) => {
    abytes3(digits);
    const dlen = digits.length;
    if (dlen === 0)
      return new Uint8Array(0);
    if (dlen >= 65536)
      throw new Error("invalid length");
    let zeros = 0;
    while (zeros < dlen - 1 && digits[zeros] === 0)
      zeros++;
    const limbs = new Uint16Array(Math.ceil(dlen * 6 / 16) + 1);
    let used = 0;
    let i = 0;
    let group = dlen % 5 || 5;
    while (i < dlen) {
      let gval = 0;
      let factor = 1;
      for (const end = i + group; i < end; i++) {
        const d = digits[i];
        if (d >= 58)
          throw new Error(`invalid integer: ${d}`);
        gval = gval * 58 + d;
        factor *= 58;
      }
      group = 5;
      let carry = gval;
      for (let k2 = 0; k2 < used; k2++) {
        const cur = limbs[k2] * factor + carry;
        carry = Math.floor(cur / 65536);
        limbs[k2] = cur - carry * 65536;
      }
      for (; carry > 0; carry = Math.floor(carry / 65536))
        limbs[used++] = carry % 65536;
    }
    const valueBytes = used === 0 ? 1 : used * 2 - (limbs[used - 1] < 256 ? 1 : 0);
    const res = new Uint8Array(zeros + valueBytes);
    let j = res.length - 1;
    for (let k2 = 0; k2 < used; k2++) {
      const limb = limbs[k2];
      res[j--] = limb & 255;
      if (j >= zeros)
        res[j--] = limb >> 8;
    }
    return res;
  }
};
var genBase58 = (abc) => chain(radix58, alphabet(abc));
var base58 = /* @__PURE__ */ freeze(() => genBase58("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"));
var createBase58check = (sha2562) => {
  afn(sha2562);
  const _sha256 = sha2562;
  return chain(checksum(4, (data) => _sha256(_sha256(data))), base58);
};

// node_modules/.pnpm/@scure+bip32@2.3.0/node_modules/@scure/bip32/index.js
var Point = /* @__PURE__ */ (() => secp256k1.Point)();
var Fn = /* @__PURE__ */ (() => Point.Fn)();
var base58check = /* @__PURE__ */ createBase58check(sha256);
var MASTER_SECRET = /* @__PURE__ */ (() => {
  return Uint8Array.from("Bitcoin seed".split(""), (char) => char.charCodeAt(0));
})();
var BITCOIN_VERSIONS = { private: 76066276, public: 76067358 };
var HARDENED_OFFSET = 2147483648;
var hash160 = (data) => ripemd160(sha256(data));
var fromU32 = (data) => createView(data).getUint32(0, false);
var toU32 = (n, title = "number") => {
  if (typeof n !== "number")
    throw new TypeError(`"${title}" expected number, got type=${typeof n}`);
  if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 32 - 1)
    throw new RangeError(`"${title}" expected integer in range 0..2**32-1, got ${n}`);
  const buf = new Uint8Array(4);
  createView(buf).setUint32(0, n, false);
  return buf;
};
var validateVersions = (versions, title = "versions") => {
  if (!(typeof versions === "object" && versions !== null))
    throw new Error("versions must be an object");
  toU32(versions.private, `${title}.private`);
  toU32(versions.public, `${title}.public`);
  return versions;
};
var HDKey = class _HDKey {
  get fingerprint() {
    if (!this.pubHash) {
      throw new Error("No publicKey set!");
    }
    return fromU32(this.pubHash);
  }
  get identifier() {
    return this.pubHash;
  }
  get pubKeyHash() {
    return this.pubHash;
  }
  // Returns the live private key buffer for this instance.
  // Copy it first if you need an immutable snapshot.
  get privateKey() {
    return this._privateKey || null;
  }
  get publicKey() {
    return this._publicKey || null;
  }
  get privateExtendedKey() {
    const priv = this._privateKey;
    if (!priv) {
      throw new Error("No private key");
    }
    return base58check.encode(this.serialize(this.versions.private, concatBytes(Uint8Array.of(0), priv)));
  }
  get publicExtendedKey() {
    if (!this._publicKey) {
      throw new Error("No public key");
    }
    return base58check.encode(this.serialize(this.versions.public, this._publicKey));
  }
  static fromMasterSeed(seed, versions = BITCOIN_VERSIONS) {
    abytes(seed);
    versions = validateVersions(versions);
    if (8 * seed.length < 128 || 8 * seed.length > 512) {
      throw new RangeError("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + seed.length);
    }
    const I = hmac(sha512, MASTER_SECRET, seed);
    const privateKey = I.slice(0, 32);
    const chainCode = I.slice(32);
    return new _HDKey({ versions, chainCode, privateKey });
  }
  static fromExtendedKey(base58key, versions = BITCOIN_VERSIONS) {
    versions = validateVersions(versions);
    const keyBuffer = base58check.decode(base58key);
    const keyView = createView(keyBuffer);
    const version = keyView.getUint32(0, false);
    const opt = {
      versions,
      depth: keyBuffer[4],
      parentFingerprint: keyView.getUint32(5, false),
      index: keyView.getUint32(9, false),
      chainCode: keyBuffer.slice(13, 45)
    };
    const key = keyBuffer.slice(45);
    const isPriv = key[0] === 0;
    if (version !== versions[isPriv ? "private" : "public"]) {
      throw new Error("Version mismatch");
    }
    if (isPriv) {
      return new _HDKey({ ...opt, privateKey: key.slice(1) });
    } else {
      return new _HDKey({ ...opt, publicKey: key });
    }
  }
  static fromJSON(json) {
    return _HDKey.fromExtendedKey(json.xpriv);
  }
  versions;
  depth = 0;
  index = 0;
  chainCode = null;
  parentFingerprint = 0;
  _privateKey;
  _publicKey;
  pubHash;
  constructor(opt) {
    if (!opt || typeof opt !== "object") {
      throw new Error("HDKey.constructor must not be called directly");
    }
    this.versions = opt.versions ? validateVersions(opt.versions) : BITCOIN_VERSIONS;
    this.depth = opt.depth || 0;
    this.chainCode = opt.chainCode ? Uint8Array.from(opt.chainCode) : null;
    this.index = opt.index || 0;
    this.parentFingerprint = opt.parentFingerprint || 0;
    if (!this.depth) {
      if (this.parentFingerprint || this.index) {
        throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
      }
    }
    if (this.depth > 255) {
      throw new Error("HDKey: depth exceeds the serializable value 255");
    }
    if (opt.publicKey && opt.privateKey) {
      throw new Error("HDKey: publicKey and privateKey at same time.");
    }
    if (opt.privateKey) {
      if (!secp256k1.utils.isValidSecretKey(opt.privateKey))
        throw new Error("Invalid private key");
      this._privateKey = Uint8Array.from(opt.privateKey);
      this._publicKey = secp256k1.getPublicKey(this._privateKey, true);
    } else if (opt.publicKey) {
      this._publicKey = Point.fromBytes(opt.publicKey).toBytes(true);
    } else {
      throw new Error("HDKey: no public or private key provided");
    }
    this.pubHash = hash160(this._publicKey);
  }
  derive(path) {
    if (!/^[mM]'?/.test(path)) {
      throw new Error('Path must start with "m" or "M"');
    }
    if (/^[mM]'?$/.test(path)) {
      return this;
    }
    const parts = path.replace(/^[mM]'?\//, "").split("/");
    let child = this;
    for (const c of parts) {
      const m = /^(\d+)('?)$/.exec(c);
      const m1 = m && m[1];
      if (!m || m.length !== 3 || typeof m1 !== "string")
        throw new Error("invalid child index: " + c);
      let idx = +m1;
      if (!Number.isSafeInteger(idx) || idx >= HARDENED_OFFSET) {
        throw new Error("Invalid index");
      }
      if (m[2] === "'") {
        idx += HARDENED_OFFSET;
      }
      child = child.deriveChild(idx);
    }
    return child;
  }
  /**
   * @param _I - Test-only override for the 64-byte HMAC-SHA512 output; normal callers must omit it.
   */
  deriveChild(index, _I) {
    if (!this._publicKey || !this.chainCode) {
      throw new Error("No publicKey or chainCode set");
    }
    let data = toU32(index, "index");
    if (index >= HARDENED_OFFSET) {
      const priv = this._privateKey;
      if (!priv) {
        throw new Error("Could not derive hardened child key");
      }
      data = concatBytes(Uint8Array.of(0), priv, data);
    } else {
      data = concatBytes(this._publicKey, data);
    }
    const out = _I || hmac(sha512, this.chainCode, data);
    abytes(out, 64);
    const childTweak = out.slice(0, 32);
    const chainCode = out.slice(32);
    const opt = {
      versions: this.versions,
      chainCode,
      depth: this.depth + 1,
      parentFingerprint: this.fingerprint,
      index
    };
    if (opt.depth > 255) {
      throw new Error("HDKey: depth exceeds the serializable value 255");
    }
    try {
      const ctweak = Fn.fromBytes(childTweak);
      if (this._privateKey) {
        const added = Fn.create(Fn.fromBytes(this._privateKey) + ctweak);
        if (!Fn.isValidNot0(added)) {
          throw new Error("The tweak was out of range or the resulted private key is invalid");
        }
        opt.privateKey = Fn.toBytes(added);
      } else {
        const point = Point.fromBytes(this._publicKey);
        const added = ctweak === 0n ? point : point.add(Point.BASE.multiply(ctweak));
        if (added.equals(Point.ZERO)) {
          throw new Error("The tweak was equal to negative P, which made the result key invalid");
        }
        opt.publicKey = added.toBytes(true);
      }
      return new _HDKey(opt);
    } catch (err) {
      return this.deriveChild(index + 1);
    }
  }
  sign(hash) {
    if (!this._privateKey) {
      throw new Error("No privateKey set!");
    }
    abytes(hash, 32);
    return secp256k1.sign(hash, this._privateKey, { prehash: false });
  }
  verify(hash, signature) {
    abytes(hash, 32);
    abytes(signature, 64);
    if (!this._publicKey) {
      throw new Error("No publicKey set!");
    }
    return secp256k1.verify(signature, hash, this._publicKey, { prehash: false });
  }
  wipePrivateData() {
    if (this._privateKey) {
      this._privateKey.fill(0);
      this._privateKey = void 0;
    }
    return this;
  }
  toJSON() {
    return {
      xpriv: this.privateExtendedKey,
      xpub: this.publicExtendedKey
    };
  }
  serialize(version, key) {
    if (!this.chainCode) {
      throw new Error("No chainCode set");
    }
    abytes(key, 33);
    return concatBytes(toU32(version, "version"), new Uint8Array([this.depth]), toU32(this.parentFingerprint, "parentFingerprint"), toU32(this.index, "index"), this.chainCode, key);
  }
};

// src/lib/wallet/nut13.ts
init_hmac();
init_sha2();
init_utils();
init_secp256k1();
init_keys();
var CASHU_KDF_DOMAIN = "Cashu_KDF_HMAC_SHA256";
var SECP256K1_N = secp256k1.Point.Fn.ORDER;
var KEYSET_V2_PREFIX = "01";
var KEYSET_V1_PREFIX = "00";
var DERIVE_SECRET = 0;
var DERIVE_BLINDING_FACTOR = 1;
var BIP32_PURPOSE = 129372;
var BIP32_COIN_TYPE = 0;
var BIP32_SECRET_INDEX = 0;
var BIP32_R_INDEX = 1;
function counterBytes(counter) {
  const bytes = new Uint8Array(8);
  let v = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}
function os2ip(bytes) {
  let x = 0n;
  for (const b of bytes) {
    x = x << 8n | BigInt(b);
  }
  return x;
}
function buildMessage(keysetId, counter, type) {
  return concatBytes(
    utf8ToBytes(CASHU_KDF_DOMAIN),
    hexToBytes(keysetId),
    counterBytes(counter),
    new Uint8Array([type])
  );
}
function deriveSecretAndR(seed, keysetId, counterK) {
  const version = keysetId.slice(0, 2);
  if (version === KEYSET_V1_PREFIX) {
    return deriveSecretAndRBip32(seed, keysetId, counterK);
  }
  if (version !== KEYSET_V2_PREFIX) {
    throw new Error(
      `NUT-13: unsupported keyset version "${version}" (expected "01" for HMAC-SHA256)`
    );
  }
  const secretDigest = hmac(sha256, seed, buildMessage(keysetId, counterK, DERIVE_SECRET));
  const rDigest = hmac(sha256, seed, buildMessage(keysetId, counterK, DERIVE_BLINDING_FACTOR));
  const r = os2ip(rDigest) % SECP256K1_N;
  if (r === 0n) {
    throw new Error("NUT-13: derived invalid blinding scalar r == 0");
  }
  return {
    secret: bytesToHex(secretDigest),
    r
  };
}
function deriveSecretAndRBip32(seed, keysetId, counterK) {
  const keysetIdInt = BigInt("0x" + keysetId) % (2n ** 31n - 1n);
  const secretPath = `m/${BIP32_PURPOSE}'/${BIP32_COIN_TYPE}'/${keysetIdInt}'/${counterK}'/${BIP32_SECRET_INDEX}`;
  const rPath = `m/${BIP32_PURPOSE}'/${BIP32_COIN_TYPE}'/${keysetIdInt}'/${counterK}'/${BIP32_R_INDEX}`;
  const root = HDKey.fromMasterSeed(seed);
  const secretKey = root.derive(secretPath).privateKey;
  const rKey = root.derive(rPath).privateKey;
  if (secretKey === null || secretKey.length !== 32) {
    throw new Error("NUT-13: BIP32 derivation produced no secret private key");
  }
  if (rKey === null || rKey.length !== 32) {
    throw new Error("NUT-13: BIP32 derivation produced no r private key");
  }
  return {
    secret: bytesToHex(secretKey),
    r: os2ip(rKey)
  };
}
function seedFromMnemonic(mnemonic) {
  return mnemonicToSeed(mnemonic);
}
var activeSeed = null;
function setActiveSeed(seed) {
  activeSeed = seed;
}
function getActiveSeed() {
  return activeSeed;
}
function clearActiveSeed() {
  activeSeed = null;
}

// src/lib/wallet/state.ts
var unlockedPrivateKey = null;
async function unlockWallet(pin) {
  const state = getWalletState();
  if (state === "UNINITIALIZED") {
    throw new WalletNotInitializedError();
  }
  const pinHash = getPinHash();
  const encryptedKey = getEncryptedKey();
  if (!pinHash || !encryptedKey) {
    throw new WalletNotInitializedError();
  }
  const valid = await verifyPin(pin, pinHash);
  if (!valid) {
    throw new InvalidPinError();
  }
  const privateKey = await decryptKey(encryptedKey, pin);
  unlockedPrivateKey = privateKey;
  const encryptedMnemonic = getEncryptedMnemonic();
  if (encryptedMnemonic) {
    try {
      const mnemonic = await decryptKey(encryptedMnemonic, pin);
      setActiveSeed(seedFromMnemonic(mnemonic));
    } catch {
    }
  }
  setWalletState("UNLOCKED");
  return getWalletStatus();
}
async function deleteWallet() {
  unlockedPrivateKey = null;
  clearActiveSeed();
  clearSessionPin();
  await clearAllWalletData();
}
function getWalletStatus() {
  const state = getWalletState();
  const meta = (() => {
    try {
      const raw = localStorage.getItem("lnwcash_wallet_meta");
      if (raw) return JSON.parse(raw);
    } catch {
    }
    return null;
  })();
  return {
    state,
    walletName: meta?.name ?? null,
    createdAt: meta?.created_at ?? null
  };
}
function getPrivateKey() {
  if (!unlockedPrivateKey) {
    throw new WalletLockedError();
  }
  return unlockedPrivateKey;
}
var SESSION_PIN_KEY = "lnw_session_pin";
function clearSessionPin() {
  try {
    sessionStorage.removeItem(SESSION_PIN_KEY);
  } catch {
  }
}

// src/lib/cashu/blind.ts
init_secp256k1();
init_sha2();
init_utils();
init_base64();
var { Fn: Fn2, BASE } = secp256k1.Point;
var CURVE_ORDER = Fn2.ORDER;
var ORDER_BYTES = Fn2.BYTES;
function bytesToBigInt(bytes) {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = result << 8n | BigInt(bytes[i]);
  }
  return result % CURVE_ORDER;
}
function bigIntToBytes(value, length) {
  const bytes = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}
var DOMAIN_SEPARATOR = "Secp256k1_HashToCurve_Cashu_";
var dsEncoder = new TextEncoder();
var DS_BYTES = dsEncoder.encode(DOMAIN_SEPARATOR);
function hash_to_curve(message) {
  const prefixed = new Uint8Array(DS_BYTES.length + message.length);
  prefixed.set(DS_BYTES, 0);
  prefixed.set(message, DS_BYTES.length);
  const msgHash = sha256(prefixed);
  for (let counter = 0; counter < 1e4; counter++) {
    const counterBytes2 = new Uint8Array(4);
    new DataView(counterBytes2.buffer).setUint32(0, counter, true);
    const hashInput = new Uint8Array(msgHash.length + 4);
    hashInput.set(msgHash, 0);
    hashInput.set(counterBytes2, msgHash.length);
    const hash = sha256(hashInput);
    try {
      return secp256k1.Point.fromHex("02" + bytesToHex(hash));
    } catch {
      try {
        return secp256k1.Point.fromHex("03" + bytesToHex(hash));
      } catch {
      }
    }
  }
  throw new Error("hash_to_curve: failed to find valid point after 10000 attempts");
}
function deterministicBlindingFactor(secret) {
  const encoder = new TextEncoder();
  const hash = sha256(encoder.encode(secret));
  let r = bytesToBigInt(hash);
  const nMinus1 = CURVE_ORDER - 1n;
  r = r % nMinus1 + 1n;
  return r;
}
function blindMessage(message, blindingFactor) {
  const r = blindingFactor ?? deterministicBlindingFactor(message);
  const encoder = new TextEncoder();
  const Y = hash_to_curve(encoder.encode(message));
  const B_point = Y.add(BASE.multiply(r));
  const B_ = B_point.toHex(true);
  const rBytes = bigIntToBytes(r, ORDER_BYTES);
  const rEncoded = base64url.encode(rBytes);
  return { B_, blindingFactor: rEncoded };
}
function unblindSignature(blindSignature, blindingFactor, mintPublicKey) {
  const rBytes = base64url.decode(blindingFactor);
  const r = bytesToBigInt(rBytes);
  const C_ = secp256k1.Point.fromHex(blindSignature);
  if (mintPublicKey) {
    const A = secp256k1.Point.fromHex(mintPublicKey);
    const C2 = C_.subtract(A.multiply(r));
    return C2.toHex(true);
  }
  const rInv = Fn2.inv(r);
  const C = C_.multiply(rInv);
  return C.toHex(true);
}
function blindingFactorToHex(blindingFactor) {
  const rBytes = base64url.decode(blindingFactor);
  return bytesToHex(rBytes);
}

// src/lib/cashu/client.ts
init_utils();
var CashuError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "CashuError";
  }
  status;
  code;
};
var MintUnreachableError = class extends CashuError {
  constructor(mintUrl, cause) {
    super(`Mint unreachable: ${mintUrl}${cause ? ` \u2014 ${cause.message}` : ""}`);
    this.name = "MintUnreachableError";
  }
};
var NetworkError = class extends CashuError {
  constructor(cause) {
    super(`Network error${cause ? `: ${cause.message}` : ""}`);
    this.name = "NetworkError";
  }
};
var STANDARD_PATHS = {
  mint_info: "/v1/info",
  keysets: "/v1/keysets",
  keys: "/v1/keys",
  mint_quote: "/v1/mint/quote/bolt11",
  mint_operation: "/v1/mint/bolt11",
  melt_quote: "/v1/melt/quote/bolt11",
  melt_operation: "/v1/melt/bolt11",
  check_state: "/v1/checkstate",
  swap: "/v1/swap",
  /** NUT-09: restore previously-issued blind signatures (TASK-206) */
  restore: "/v1/restore",
  /** TASK-084: quote status check endpoints */
  mint_quote_check: "/v1/mint/quote/bolt11",
  melt_quote_check: "/v1/melt/quote/bolt11"
};
function getSupportedPaymentMethod(mintInfo, nut) {
  const nutSettings = mintInfo.nuts?.[nut];
  if (!nutSettings) return void 0;
  const methods = nutSettings.methods;
  if (methods && methods.length > 0) {
    return methods[0].method;
  }
  return void 0;
}
function resolveOperationPath(mintInfo, httpMethod, standardPath, pathKeywords) {
  if (!mintInfo?.nuts) return standardPath;
  const nut19 = mintInfo.nuts["19"];
  if (!nut19?.cached_endpoints || nut19.cached_endpoints.length === 0) {
    return standardPath;
  }
  const cached = nut19.cached_endpoints.find(
    (ep) => ep.method.toUpperCase() === httpMethod.toUpperCase() && !ep.path.includes("/quote/") && pathKeywords.some((kw) => ep.path.includes(kw))
  );
  return cached?.path ?? standardPath;
}
function resolveQuotePath(mintInfo, action, nutNumber, standardPath) {
  if (!mintInfo?.nuts) return standardPath;
  const nut19 = mintInfo.nuts["19"];
  if (nut19?.cached_endpoints) {
    const cached = nut19.cached_endpoints.find(
      (ep) => ep.method.toUpperCase() === "POST" && ep.path.includes("/quote/")
    );
    if (cached) return cached.path;
  }
  const paymentMethod = getSupportedPaymentMethod(mintInfo, nutNumber);
  if (paymentMethod) {
    return `/v1/${action}/quote/${paymentMethod}`;
  }
  return standardPath;
}
function resolveEndpointPath(mintInfo, operationKey) {
  const standardPath = STANDARD_PATHS[operationKey] ?? "/v1/info";
  if (!mintInfo) return standardPath;
  switch (operationKey) {
    case "mint_operation":
      return resolveOperationPath(mintInfo, "POST", standardPath, ["/mint"]);
    case "mint_quote":
      return resolveQuotePath(mintInfo, "mint", "4", standardPath);
    case "melt_operation":
      return resolveOperationPath(mintInfo, "POST", standardPath, ["/melt", "/burn"]);
    case "melt_quote":
      return resolveQuotePath(mintInfo, "melt", "5", standardPath);
    case "swap":
      return resolveOperationPath(mintInfo, "POST", standardPath, ["/swap"]);
    case "restore":
      return resolveOperationPath(mintInfo, "POST", standardPath, ["/restore"]);
    default:
      return standardPath;
  }
}
function normalizeMintUrl(mintUrl) {
  return mintUrl.replace(/\/+$/, "");
}
async function fetchFromMint(mintUrl, path, options = {}) {
  let url;
  if (typeof window !== "undefined" && mintUrl === "https://mint.lnw.cash") {
    url = `/api/mint${path}`;
  } else {
    url = `${normalizeMintUrl(mintUrl)}${path}`;
  }
  const { method = "GET", body, timeout = 15e3 } = options;
  const headers = {
    Accept: "application/json"
  };
  let requestBody;
  if (body !== void 0) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      let errorDetail = "";
      try {
        const errorBody = await response.json();
        errorDetail = errorBody.detail || errorBody.error || "";
      } catch {
      }
      throw new CashuError(
        `HTTP ${response.status}: ${errorDetail || response.statusText}`,
        response.status
      );
    }
    const data = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof CashuError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NetworkError(new Error(`Request timeout to ${url}`));
    }
    if (error instanceof TypeError) {
      throw new MintUnreachableError(mintUrl, error);
    }
    throw new NetworkError(error);
  }
}
async function requestMintQuote(mintUrl, amount, mintInfo) {
  const path = resolveEndpointPath(mintInfo, "mint_quote");
  return fetchFromMint(mintUrl, path, {
    method: "POST",
    body: { amount, unit: "sat" }
  });
}
async function checkState(mintUrl, proofs) {
  const path = STANDARD_PATHS.check_state;
  const Ys = proofs.map((p) => hash_to_curve(hexToBytes(p.secret)).toHex(true));
  try {
    return await fetchFromMint(mintUrl, path, {
      method: "POST",
      body: { Ys }
    });
  } catch (e) {
    if (e instanceof CashuError && e.status === 400) {
      return fetchFromMint(mintUrl, path, {
        method: "POST",
        body: { Ys: proofs.map((p) => p.C) }
      });
    }
    throw e;
  }
}
async function restoreOutputs(mintUrl, outputs, mintInfo) {
  const path = resolveEndpointPath(mintInfo, "restore");
  return fetchFromMint(mintUrl, path, {
    method: "POST",
    body: { outputs }
  });
}
async function mintTokens(mintUrl, quoteId, outputs, mintInfo) {
  const path = resolveEndpointPath(mintInfo, "mint_operation");
  return fetchFromMint(mintUrl, path, {
    method: "POST",
    body: { quote: quoteId, outputs }
  });
}
async function checkMintQuote(mintUrl, quoteId) {
  const path = `${STANDARD_PATHS.mint_quote_check}/${encodeURIComponent(quoteId)}`;
  return fetchFromMint(mintUrl, path, { method: "GET" });
}
async function pollMintQuoteUntil(mintUrl, quoteId, targetState = "PAID", maxWaitMs = 12e4, pollIntervalMs = 2e3) {
  const startTime = Date.now();
  let interval = pollIntervalMs;
  while (Date.now() - startTime < maxWaitMs) {
    const quote = await checkMintQuote(mintUrl, quoteId);
    const state = quote.state ?? "UNPAID";
    if (state === targetState) {
      return quote;
    }
    if (state === "EXPIRED") {
      throw new Error(`Mint quote ${quoteId} has expired`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    interval = Math.min(interval * 1.5, 3e4);
  }
  throw new Error(`Mint quote ${quoteId} did not reach state "${targetState}" within ${maxWaitMs}ms`);
}
async function requestMeltQuote(mintUrl, invoice, amount, mintInfo) {
  const body = { request: invoice, unit: "sat" };
  if (amount !== void 0) body.amount = amount;
  const path = resolveEndpointPath(mintInfo, "melt_quote");
  return fetchFromMint(mintUrl, path, {
    method: "POST",
    body
  });
}
async function meltTokens(mintUrl, quoteId, inputs, outputs, mintInfo) {
  const body = { quote: quoteId, inputs };
  if (outputs && outputs.length > 0) body.outputs = outputs;
  const path = resolveEndpointPath(mintInfo, "melt_operation");
  return fetchFromMint(mintUrl, path, {
    method: "POST",
    body
  });
}

// src/lib/cashu/keyset.ts
async function fetchAndCacheKeysets(mintUrl) {
  let url;
  if (typeof window !== "undefined" && mintUrl === "https://mint.lnw.cash") {
    url = `/api/mint/v1/keys`;
  } else {
    url = `${mintUrl.replace(/\/+$/, "")}/v1/keys`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15e3);
  let data;
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to fetch keys`);
    }
    data = await res.json();
  } finally {
    clearTimeout(timeout);
  }
  const mintKeysets = data?.keysets ?? [];
  const cache = mintKeysets.map((ks) => ({
    id: ks.id,
    unit: ks.unit,
    active: ks.active,
    input_fee_ppk: ks.input_fee_ppk ?? 0,
    keys: ks.keys ?? {},
    last_updated: Date.now()
  }));
  setKeysetCache(mintUrl, cache);
  return cache;
}
function getKeysetById(mintUrl, keysetId) {
  const cache = getKeysetCache(mintUrl);
  return cache.find((k2) => k2.id === keysetId) ?? null;
}
function getAllKeysets(mintUrl) {
  return getKeysetCache(mintUrl);
}
function getMintPubkey(mintUrl, keysetId, amount) {
  const fullId = resolveKeysetId(mintUrl, keysetId) || keysetId;
  const keyset = getKeysetById(mintUrl, fullId);
  if (!keyset || !keyset.keys) return void 0;
  if (amount !== void 0 && keyset.keys[String(amount)]) {
    return keyset.keys[String(amount)];
  }
  const amounts = Object.keys(keyset.keys).map(Number).filter((n) => !isNaN(n));
  if (amounts.length === 0) return void 0;
  const minAmount = Math.min(...amounts);
  return keyset.keys[minAmount];
}
function resolveKeysetId(mintUrl, shortId) {
  if (shortId.length > 16) return shortId;
  const allKeysets = getAllKeysets(mintUrl);
  for (const ks of allKeysets) {
    if (ks.id.startsWith(shortId)) {
      return ks.id;
    }
  }
  return void 0;
}

// src/lib/wallet/counterK.ts
var STORAGE_KEY = "lnwcash_counter_k";
function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}
function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
  }
}
function getCounterK(keysetId) {
  const value = readAll()[keysetId];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
function setCounterK(keysetId, value) {
  const map = readAll();
  map[keysetId] = Math.max(0, Math.floor(value));
  writeAll(map);
}
function incrementCounterK(keysetId, by = 1) {
  const next = getCounterK(keysetId) + Math.max(0, Math.floor(by));
  setCounterK(keysetId, next);
  return next;
}
function clearAllCounters() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}

// src/lib/wallet/mint.ts
init_proofsDb();

// src/lib/storage/db.ts
init_build();
var DB_NAME2 = "lnw-cash";
var DB_VERSION2 = 1;
var STORE_NAME2 = "transactions";
var dbPromise2 = null;
var dbInstance2 = null;
async function getDB2() {
  if (dbInstance2) return dbInstance2;
  if (!dbPromise2) {
    dbPromise2 = openDB(DB_NAME2, DB_VERSION2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME2)) {
          const store2 = db.createObjectStore(STORE_NAME2, { keyPath: "id" });
          store2.createIndex("type", "type");
          store2.createIndex("mint_url", "mint_url");
          store2.createIndex("timestamp", "timestamp");
          store2.createIndex("status", "status");
        }
      }
    });
  }
  dbInstance2 = await dbPromise2;
  return dbInstance2;
}
async function addTransaction(tx) {
  const db = await getDB2();
  await db.add(STORE_NAME2, tx);
  return tx.id;
}

// src/lib/wallet/mint.ts
function generateRandomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function createOutputs(amounts, mintUrl, keysetId, seed) {
  const startCounter = seed ? getCounterK(keysetId) : 0;
  return amounts.map((amount, i) => {
    let secret;
    let r;
    if (seed) {
      const derived = deriveSecretAndR(seed, keysetId, startCounter + i);
      secret = derived.secret;
      r = derived.r;
    } else {
      secret = generateRandomSecret();
      r = deterministicBlindingFactor(secret);
    }
    const { B_, blindingFactor } = blindMessage(secret, r);
    return {
      amount,
      id: keysetId,
      B_,
      secret,
      blindingFactor
    };
  });
}
function decomposeAmount(amount) {
  const result = [];
  let remaining = amount;
  const denominations = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864, 134217728, 268435456, 536870912, 1073741824, 2147483648];
  for (let i = denominations.length - 1; i >= 0; i--) {
    while (remaining >= denominations[i]) {
      result.push(denominations[i]);
      remaining -= denominations[i];
    }
  }
  if (remaining > 0) {
    result.push(remaining);
  }
  return result;
}
async function requestMint(mintUrl, amount) {
  try {
    getPrivateKey();
    const keysets = await fetchAndCacheKeysets(mintUrl);
    const activeKeysets = keysets.filter((k2) => k2.active);
    if (activeKeysets.length === 0) {
      throw new Error("No active keysets found for this mint");
    }
    const keysetId = activeKeysets[0].id;
    const quote = await requestMintQuote(mintUrl, amount);
    const quoteState = quote.state ?? "UNPAID";
    if (quoteState !== "UNPAID") {
      throw new Error(`Quote state is ${quoteState} \u2014 expected UNPAID before minting (quote: ${quote.quote})`);
    }
    return {
      success: true,
      quote: quote.quote,
      request: quote.request,
      amount,
      expiry: quote.expiry,
      state: quoteState,
      keysetId
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof Error && error.message.includes("fetch")) {
      return {
        success: false,
        quote: "",
        request: "",
        amount: 0,
        expiry: 0,
        state: "",
        keysetId: "",
        error: `Mint unreachable: ${mintUrl}`
      };
    }
    return {
      success: false,
      quote: "",
      request: "",
      amount: 0,
      expiry: 0,
      state: "",
      keysetId: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function completeMint(mintUrl, quoteId, amount, keysetId, waitForPayment = true, seed) {
  try {
    getPrivateKey();
    let quoteState = "UNPAID";
    let bolt11Invoice = null;
    if (waitForPayment) {
      const paidQuote = await pollMintQuoteUntil(mintUrl, quoteId, "PAID");
      quoteState = paidQuote.state ?? "PAID";
      bolt11Invoice = paidQuote.request ?? null;
    } else {
      const quote = await checkMintQuote(mintUrl, quoteId);
      quoteState = quote.state ?? "UNPAID";
      bolt11Invoice = quote.request ?? null;
    }
    if (quoteState !== "PAID") {
      throw new Error(`Quote ${quoteId} is not PAID (state: ${quoteState}) \u2014 cannot mint tokens yet`);
    }
    const amounts = decomposeAmount(amount);
    const resolvedSeed = seed ?? getActiveSeed() ?? void 0;
    const outputs = createOutputs(amounts, mintUrl, keysetId, resolvedSeed);
    const postBody = outputs.map((o) => ({
      amount: o.amount,
      id: o.id,
      B_: o.B_
    }));
    const response = await mintTokens(mintUrl, quoteId, postBody);
    try {
      await fetchAndCacheKeysets(mintUrl);
    } catch {
    }
    const proofs = response.signatures.map((sig, i) => {
      const output = outputs[i];
      const pubkey = getMintPubkey(mintUrl, keysetId, sig.amount);
      const C = unblindSignature(sig.C_, output.blindingFactor, pubkey);
      const rHex = blindingFactorToHex(output.blindingFactor);
      const proof = {
        id: sig.id,
        amount: sig.amount,
        secret: output.secret,
        C
      };
      if (sig.dleq) {
        proof.dleq = { e: sig.dleq.e, s: sig.dleq.s, r: rHex };
      }
      return proof;
    });
    await addProofs(proofs, mintUrl, keysetId);
    if (resolvedSeed) {
      incrementCounterK(keysetId, amounts.length);
    }
    try {
      await addTransaction({
        id: `mint-${quoteId}`,
        type: "mint",
        amount,
        mint_url: mintUrl,
        timestamp: Date.now(),
        token_hash: null,
        invoice: bolt11Invoice,
        status: "confirmed",
        protocol: "lightning",
        fee: 0
      });
    } catch {
    }
    return {
      success: true,
      proofs,
      quote: quoteId,
      amount
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof Error && error.message.includes("fetch")) {
      return {
        success: false,
        proofs: [],
        quote: "",
        amount: 0,
        error: `Mint unreachable: ${mintUrl}`
      };
    }
    return {
      success: false,
      proofs: [],
      quote: "",
      amount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function mintFlow(mintUrl, amount) {
  try {
    const reqResult = await requestMint(mintUrl, amount);
    if (!reqResult.success) {
      return {
        success: false,
        proofs: [],
        quote: "",
        amount: 0,
        error: reqResult.error
      };
    }
    const completeResult = await completeMint(
      mintUrl,
      reqResult.quote,
      amount,
      reqResult.keysetId,
      true
      // wait for payment
    );
    return {
      success: completeResult.success,
      proofs: completeResult.proofs,
      quote: completeResult.quote,
      amount: completeResult.amount,
      error: completeResult.error
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof Error && error.message.includes("fetch")) {
      return {
        success: false,
        proofs: [],
        quote: "",
        amount: 0,
        error: `Mint unreachable: ${mintUrl}`
      };
    }
    return {
      success: false,
      proofs: [],
      quote: "",
      amount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// src/lib/wallet/restore.ts
init_proofsDb();
async function restoreBatch(mintUrl, seed, keysetId, startCounter, batchSize) {
  const prepared = [];
  for (let i = 0; i < batchSize; i++) {
    const counter = startCounter + i;
    const { secret, r } = deriveSecretAndR(seed, keysetId, counter);
    const { B_, blindingFactor } = blindMessage(secret, r);
    prepared.push({
      amount: 0,
      // amount unknown at restore time — mint returns it in the signature
      id: keysetId,
      B_,
      blindingFactor,
      secret
    });
  }
  const requestOutputs = prepared.map((o) => ({
    amount: o.amount,
    id: o.id,
    B_: o.B_
  }));
  const response = await restoreOutputs(mintUrl, requestOutputs);
  const proofs = response.signatures.map((sig, i) => {
    const output = prepared[i];
    const pubkey = getMintPubkey(mintUrl, keysetId, sig.amount);
    const C = unblindSignature(sig.C_, output.blindingFactor, pubkey);
    const proof = {
      id: sig.id,
      amount: sig.amount,
      secret: output.secret,
      C
    };
    if (sig.dleq) {
      proof.dleq = {
        e: sig.dleq.e,
        s: sig.dleq.s,
        r: blindingFactorToHex(output.blindingFactor)
      };
    }
    return proof;
  });
  return { proofs, signaturesCount: response.signatures.length };
}
async function restoreWallet(mintUrl, seed, keysetId, options = {}) {
  const batchSize = options.batchSize ?? 100;
  const emptyBatchLimit = options.emptyBatchLimit ?? 3;
  const persist = options.persist ?? true;
  try {
    let counter = 0;
    let emptyBatches = 0;
    let lastNonEmptyCounter = 0;
    const recovered = [];
    while (true) {
      const { proofs, signaturesCount } = await restoreBatch(
        mintUrl,
        seed,
        keysetId,
        counter,
        batchSize
      );
      if (signaturesCount === 0) {
        emptyBatches++;
        if (emptyBatches >= emptyBatchLimit) break;
      } else {
        emptyBatches = 0;
        const states = await checkState(
          mintUrl,
          proofs.map((p) => ({ secret: p.secret, C: p.C }))
        );
        const unspent = proofs.filter(
          (_p, i) => states.states[i]?.state === "UNSPENT"
        );
        recovered.push(...unspent);
        lastNonEmptyCounter = counter + proofs.length;
      }
      counter += batchSize;
    }
    setCounterK(keysetId, lastNonEmptyCounter);
    if (persist && recovered.length > 0) {
      await addProofs(recovered, mintUrl, keysetId);
    }
    return {
      success: true,
      proofs: recovered,
      counter: lastNonEmptyCounter
    };
  } catch (error) {
    return {
      success: false,
      proofs: [],
      counter: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// .arx/evidence/saber/TASK-231/backend/repro-entry.ts
var store = /* @__PURE__ */ new Map();
var ls = {
  getItem: (k2) => store.has(k2) ? store.get(k2) : null,
  setItem: (k2, v) => {
    store.set(k2, String(v));
  },
  removeItem: (k2) => {
    store.delete(k2);
  },
  clear: () => store.clear()
};
globalThis.localStorage = ls;
globalThis.window = { localStorage: ls };
globalThis.isSecureContext = true;
var MINT_URL = "https://mint.lnw.cash/";
var BASE2 = "https://mint.lnw.cash";
var KEYSET = "00c25786d85a1dcd";
var PIN = "123456";
function log(label, data) {
  console.log(`
=== ${label} ===`);
  if (data !== void 0) {
    console.log(typeof data === "string" ? data : JSON.stringify(data, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  }
}
function k(label) {
  console.log(`[counter_k] ${label}: ${getCounterK(KEYSET)}`);
}
async function rawPost(path, body) {
  const res = await fetch(`${BASE2}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.text() };
}
async function main() {
  console.log('TASK-231 RC-4 Live Repro \u2014 mint 400 "outputs already signed" (code 11003)');
  console.log("Mint:", BASE2, "| Keyset:", KEYSET, "| Nutshell/0.20.1");
  await fetchAndCacheKeysets(MINT_URL);
  log('PART A \u2014 isolate the exact "outputs already signed" trigger (seed A)');
  {
    const seedA = mnemonicToSeed(MNEMONIC_A);
    const { secret, r } = deriveSecretAndR(seedA, KEYSET, 0);
    const { B_ } = blindMessage(secret, r);
    const qA = await requestMintQuote(MINT_URL, 64);
    await pollMintQuoteUntil(MINT_URL, qA.quote, "PAID", 6e4, 2e3);
    const a1 = await rawPost("/v1/mint/bolt11", { quote: qA.quote, outputs: [{ amount: 64, id: KEYSET, B_ }] });
    log("A1: quote A + B_ (first sign)", { status: a1.status, sig: JSON.parse(a1.body).signatures?.[0]?.C_?.slice(0, 20) + "..." });
    const a2 = await rawPost("/v1/mint/bolt11", { quote: qA.quote, outputs: [{ amount: 64, id: KEYSET, B_ }] });
    log("A2: quote A + B_ AGAIN (double-submit control \u2192 idempotent 200)", { status: a2.status });
    const qB = await requestMintQuote(MINT_URL, 64);
    await pollMintQuoteUntil(MINT_URL, qB.quote, "PAID", 6e4, 2e3);
    const a3 = await rawPost("/v1/mint/bolt11", { quote: qB.quote, outputs: [{ amount: 64, id: KEYSET, B_ }] });
    log("A3: quote B (NEW) + same B_ \u2192 FULL 400 body", { status: a3.status, rawBody: a3.body });
    try {
      log("A3 parsed", JSON.parse(a3.body));
    } catch {
    }
  }
  log("PART B \u2014 counter_k trace with wallet functions (seed B)");
  clearAllCounters();
  await importSeed(MNEMONIC_B, PIN, "Repro Wallet");
  await unlockWallet(PIN);
  k("start (cleared)");
  const mint = await mintFlow(MINT_URL, 64);
  log("B1: mintFlow(64) result", { success: mint.success, numProofs: mint.proofs.length, error: mint.error });
  k("after mint");
  {
    const proof = mint.proofs[0];
    let melted = false;
    for (let attempt = 1; attempt <= 3 && !melted; attempt++) {
      try {
        const selfQ = await requestMintQuote(MINT_URL, 32);
        const mq = await requestMeltQuote(MINT_URL, selfQ.request, 32);
        await new Promise((r) => setTimeout(r, 1500));
        const changeSecret = (() => {
          const b = new Uint8Array(32);
          crypto.getRandomValues(b);
          return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
        })();
        const { B_: changeB } = blindMessage(changeSecret);
        const mr = await meltTokens(MINT_URL, mq.quote, [{ amount: 64, id: KEYSET, secret: proof.secret, C: proof.C }], [{ amount: 32, id: KEYSET, B_: changeB }]);
        log(`B2: melt 32 (attempt ${attempt}) spent counter-0 proof`, { paid: mr.paid, changeAmounts: mr.change?.map((c) => c.amount) });
        melted = true;
      } catch (e) {
        log(`B2 melt attempt ${attempt} failed`, { message: e?.message });
      }
    }
    k("after melt (unchanged \u2014 melt.ts never calls incrementCounterK)");
  }
  await deleteWallet();
  clearAllCounters();
  k("after clear (new device)");
  await importSeed(MNEMONIC_B, PIN, "Repro Wallet");
  await unlockWallet(PIN);
  await fetchAndCacheKeysets(MINT_URL);
  const restore = await restoreWallet(MINT_URL, seedB, KEYSET);
  log("B4: restoreWallet (NUT-9) result", { success: restore.success, counter: restore.counter, numProofs: restore.proofs.length, proofAmounts: restore.proofs.map((p) => p.amount) });
  k("after restore");
  const mintAgain = await mintFlow(MINT_URL, 64);
  log("B5: mintFlow(64) again \u2192 SUCCESS (counter reconstructed correctly)", { success: mintAgain.success, numProofs: mintAgain.proofs.length, error: mintAgain.error });
  k("after mint-again");
  log("PART C \u2014 checkState on a SPENT proof (client.ts uses hexToBytes \u2192 always UNSPENT)");
  {
    const spentProof = mint.proofs[0];
    const st = await checkState(MINT_URL, [{ secret: spentProof.secret, C: spentProof.C }]);
    log("checkState(spent counter-0 proof)", st);
  }
  console.log("\n=== REPRO COMPLETE ===");
}
var MNEMONIC_A = generateMnemonic();
var MNEMONIC_B = generateMnemonic();
var seedB = mnemonicToSeed(MNEMONIC_B);
main().catch((e) => {
  console.error("REPRO FAILED", e);
  process.exit(1);
});
/*! Bundled license information:

@noble/curves/utils.js:
@noble/curves/abstract/modular.js:
@noble/curves/abstract/curve.js:
@noble/curves/abstract/der.js:
@noble/curves/abstract/weierstrass.js:
@noble/curves/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@capacitor/core/dist/index.cjs.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)

@scure/base/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/bip32/index.js:
  (*! scure-bip32 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) *)
*/
