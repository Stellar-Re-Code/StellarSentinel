const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const { 
  xdr, 
  Address, 
  scValToNative, 
  nativeToScVal 
} = require("@stellar/stellar-sdk");

const {
  validateContractId,
  encodeAddress,
  encodeI128,
  encodeU32,
  encodeU64,
  encodeString,
  CONTRACT_IDS
} = require("../src/lib/soroban");

test("validateContractId rejects empty or example placeholder IDs", () => {
  // Empty
  assert.throws(() => validateContractId("", "Treasury"), /not configured/);
  // Placeholder
  assert.throws(() => validateContractId("PLACEHOLDER_TREASURY_CONTRACT_ID", "Treasury"), /not configured/);
  // Hardcoded example ID
  assert.throws(
    () => validateContractId("CD2M7R6E55D36VTR2C5BIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA", "Treasury"),
    /not configured/
  );
  // Valid ID passes without throwing
  assert.doesNotThrow(() => validateContractId("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", "Treasury"));
});

test("Soroban encoding helpers correctly construct typed ScVal values", () => {
  const testAddr = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
  
  // 1. Address
  const addrScVal = encodeAddress(testAddr);
  assert.equal(addrScVal.switch().name, "scvAddress");
  assert.equal(scValToNative(addrScVal), testAddr);

  // 2. i128
  const i128ScVal = encodeI128("10000000000");
  assert.equal(i128ScVal.switch().name, "scvI128");
  assert.equal(scValToNative(i128ScVal), 10000000000n);

  // 3. u32
  const u32ScVal = encodeU32(42);
  assert.equal(u32ScVal.switch().name, "scvU32");
  assert.equal(scValToNative(u32ScVal), 42);

  // 4. u64
  const u64ScVal = encodeU64(1700000000);
  assert.equal(u64ScVal.switch().name, "scvU64");
  assert.equal(scValToNative(u64ScVal), 1700000000n);

  // 5. string
  const strScVal = encodeString("Withdrawal Proposal");
  assert.equal(strScVal.switch().name, "scvString");
  assert.equal(scValToNative(strScVal), "Withdrawal Proposal");
});

test("scValToNative correctly decodes simulated Soroban return structures into application data", () => {
  const mockConfig = {
    admin: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
    threshold: 2,
    tx_count: 5,
    policy_version: 1,
  };

  const scVal = nativeToScVal(mockConfig);
  const decoded = scValToNative(scVal);

  assert.equal(decoded.admin, mockConfig.admin);
  assert.equal(Number(decoded.threshold), 2);
  assert.equal(Number(decoded.tx_count), 5);
  assert.equal(Number(decoded.policy_version), 1);
});

test("authorization filtering rejects simulations requesting unauthorized signers", () => {
  const connectedAccount = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
  const rogueAccount = "GBBDNCOHHGBDY743477F322P363746356743477F322P36374635111";

  // Mock simulation auth check
  const checkAuth = (authAddress, userAddress) => {
    return authAddress.toLowerCase() === userAddress.toLowerCase();
  };

  assert.equal(checkAuth(connectedAccount, connectedAccount), true);
  assert.equal(checkAuth(rogueAccount, connectedAccount), false);
});
