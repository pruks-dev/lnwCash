import { describe, it, expect } from 'vitest';
import { decodeToken } from '../../cashu/token';

// TASK-509 v2 forensic analysis — Commander-provided token from scan (1245 chars).
// SABER forensic finding: token does NOT conform to NUT-00 V4 spec. The CBOR structure
// is map(3) with text(7) binary keys and uint(0) keys — neither matches cashu-ts
// reference nor our 1-char ASCII key spec. This test is KEPT for forensic reference but
// SKIPPED because the token is invalid (root cause: App.svelte lowercase bug, now
// fixed in TASK-509 v3 commit e810d54).
const CASHU_ME_TOKEN = 'cashuBo2ftdwh0dhbzoi8vbwludc5sbncuy2fzagf1y3nhdgf0gajhaugawleg2fodzwfwhkrhyqhhc3hayjm4yzi3nwe4njy3mjcxztq4mdmyodqxothlnde3yti3ote3mdk5mmy0nwqyn2vmmde2y2ningyzmjmyogywzgfjwced6x07wcr2qs7ndad_1qipmj8osss0qisshwjuz6aztbxhzknhzvgghkhewor6oyljwh5cyfwnvsnvpetpcgeka0ndfsbjc7zhc1ggusoyofppkqi5bv3imxpw4nq0vlqj9bjbnb2q7dgi2vthclggma0pmvtgpq7nxdy9nmkkvfhw33fxoavmlwnjal7n0iskyweeyxn4qgq5njjimmnlmzvimmzlzwewodeyzda0ymrmzmmwzjqyyjbmzdrlzwm4zjizm2qyntninwiwmgnhyjy5zwy3mzbhy1gha6ounl3d6hdtmoflqt5g50bzsy48xvlv-98ergrlc18wywsjywvyipvp0ghhtdjlcfuk4ybfjzooypo3pchk0ioqhc41iup6yxnyip9clestskpw4mdcabuygn-wjwutsptrogl02ousrkanyxjyipxmo4ddw5nmpomm6jje9mezmj44tcfb8uyv-rca8shtpgfhamfzeea3zwu4zgzmowrkmgjkmjlhmdc0mzcwnmm1n2y2ztfhyzvkywniztq4yzy4otm0mmnjmzc2oda5yjjjztq5ndvkywnyiqj0ufae1g4yf33tdkepl-tp1y1mu-6igocsc98d7oy-kgfko2flwcdlx_1gqs2mbspf7rapyk2o-z4bfmo53lezirydyeimawfzwcauh0_p47w82mryfnasdf8aqxoovuhqkt5h-a_s1teo_2fywcb655r_2dasvikfwipmuaczxigtok2y9nhiqhh6k4iim6rhyqfhc3hamwfinwm1mta3ytexzjkwzdq4zjnmzthjota3zmnjmmnknje5mwrln2uymza5odhlzmfhogm3yjuymjkwndk2owfjwcecxpcxniicarmilui371iq6p09yi3dumrtcgsrsexk_k5hzknhzvggvcauz5j7ptswdk0jlv7_mzvwq1ddrmgmgy_1juach_9hc1gggbtpgzh6ndxlcyfl0lcxrdiq9gvyrnuw-ihkgw1f0i9hclggzrjc-fu4euajs6kakqkkdhqvybh8fc0vcwmlqpwyye0';

describe.skip('decode cashu.me V4 token (FORENSIC — token was invalid, root cause: lowercase bug)', () => {
  it('decodes real cashu.me token end-to-end', () => {
    const result = decodeToken(CASHU_ME_TOKEN);
    expect(result.mint).toMatch(/^https:\/\//);
    expect(result.proofs.length).toBeGreaterThan(0);
    expect(result.unit).toBe('sat');
  });
});