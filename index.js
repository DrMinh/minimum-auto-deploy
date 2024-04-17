const http = require('http');
const crypto = require('crypto');
const url = require('url');
const config = require('./config.json');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs/promises');

// Create an HTTP server to handle incoming webhook requests
const server = http.createServer((req, res) => {

    const reqUrl = url.parse(req.url, true);

    if (req.method === 'POST' && reqUrl.pathname === config.path) {

        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => {

            // Parse the payload
            const payload = JSON.parse(body);

            // get repo config
            const repository = config.repositories.find(x => x.clone_url === payload.repository?.clone_url);

            if (!repository) {
                console.error(`Can not found repository ${payload.repository?.clone_url} in config.json`);
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('unknown repository');
                return;
            }

            // Validate the signature
            const expectedSignature = 'sha256=' + crypto.createHmac('sha256', repository.secret)
                .update(body)
                .digest('hex');

            const actualSignature = req.headers['x-hub-signature-256'];

            if (actualSignature !== expectedSignature) {
                console.error('Invalid signature. Request ignored.');
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('Unauthorized');
                return;
            }

            // Check if it's a push event and the branch is 'dev-build'
            if (payload && payload.ref === `refs/heads/${repository.branch}` && payload.commits) {
                console.log('Received a push event to the dev-build branch.');

                // kill old building progress if exist
                if (repository.childProgress) repository.childProgress.kill();


                // Run a shell command (replace with your desired command)
                runScript(repository);
            }

            // Respond to Gitea
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
    }
});

async function runScript(repository) {
    try {
        if (repository.ssh_infor) {
            const pullSourceCode = await fs.readFile('./command/pull-source.sh', { encoding: 'utf8' });
            const gitPullProgress = await exec(
                pullSourceCode
                    .replace('{{local_path}}', repository.local_path)
                    .replace('{{branch}}', repository.branch)
                    .replace('{{path_to_private_key}}', repository.ssh_infor.path_to_private_key)
                    .replace('{{ssh_url}}', repository.ssh_infor.ssh_url)
            );
            console.log('gitPullProgress out:', gitPullProgress.stdout);
            console.log('gitPullProgress error:', gitPullProgress.stderr);
        }

        const userProgress = exec(repository.script);
        repository.childProgress = userProgress.child;
        const userScript = await repository.childProgress;
        console.log('userScript out:', userScript.stdout);
        console.log('userScript error:', userScript.stderr);
    }
    catch (e) {
        console.log('Script error:', e);
    }
}

const PORT = config.port;
server.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
});