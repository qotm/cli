// Preloaded with --import to prove a command never touches the network:
// any socket, DNS lookup or fetch throws.
import dns from 'node:dns';
import net from 'node:net';

const refuse = () => {
	throw new Error('network access refused (test/no-network.mjs)');
};
net.Socket.prototype.connect = refuse;
dns.lookup = refuse;
dns.promises.lookup = refuse;
globalThis.fetch = async () => refuse();
