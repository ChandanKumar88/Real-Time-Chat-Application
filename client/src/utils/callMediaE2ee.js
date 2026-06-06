export function supportsCallMediaE2ee() {
  return false;
}

export async function createCallMediaE2ee() {
  return {
    isStrong: false,
    protectSender() {},
    protectReceiver() {},
    close() {},
  };
}
