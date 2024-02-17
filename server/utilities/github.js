/***
 * Copyright (C) Rodolfo Herrera Hernandez. All rights reserved.
 * Licensed under the MIT license. See LICENSE file in the project root
 * for full license information.
 *
 * =+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
 *
 * For related information - https://github.com/rodyherrera/Quantum/
 *
 * All your applications, just in one place. 
 *
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
****/

const { Octokit } = require('@octokit/rest');
const { PTYHandler } = require('@utilities/ptyHandler');
const { promisify } = require('util');
const simpleGit = require('simple-git');
const Deployment = require('@models/deployment');
const exec = promisify(require('child_process').exec);
const fs = require('fs');

class Github{
    constructor(user, repository){
        this.user = user;
        this.repository = repository;
        this.octokit = new Octokit({ auth: user.github.accessToken });
    };

    static async deleteLogAndDirectory(logPath, directoryPath){
        try{
            await fs.promises.rm(logPath);
            await fs.promises.rm(directoryPath, { recursive: true });
        }catch (error){
            console.error('[Quantum Cloud]: CRITCAL ERROR -> Deletion failed:', error.message);
        }
    };
    
    async cloneRepository() {
        const destinationPath = `./storage/containers/${this.user._id}/github-repos/${this.repository._id}`;
        try {
            const repositoryInfo = await this.octokit.repos.get({ 
                owner: this.user.github.username, 
                repo: this.repository.name 
            });
            const cloneEndpoint = repositoryInfo.data.private
                ? repositoryInfo.data.clone_url.replace('https://', `https://${this.user.github.accessToken}@`)
                : repositoryInfo.data.clone_url;
            await exec(`git clone ${cloneEndpoint} ${destinationPath}`);
        } catch (error) {
            console.error('[Quantum Cloud]: CRITICAL ERROR -> Cloning failed:', error.message);
        }
    }

    async readEnvironmentVariables(){
        let envFiles = await simpleGit(`./storage/containers/${this.user._id}/github-repos/${this.repository._id}`).raw(['ls-tree', 'HEAD', '-r', '--name-only']);
        envFiles = envFiles.split('\n').filter(file => file.includes('.env'));
        const environmentVariables = {};
        for(const envFile of envFiles){
            const file = await simpleGit(`./storage/containers/${this.user._id}/github-repos/${this.repository._id}`).raw(['show', 'HEAD:' + envFile]);
            const lines = file.split('\n');
            lines.forEach(line => {
                if(line.trim() === '' || line.trim().startsWith('#')){
                    return;
                }
                const [key, value] = line.split('=');
                environmentVariables[key.trim()] = value?.trim() || '';
            });
        };
        return environmentVariables;
    };

    async getLatestCommit(){
        const { data: commits } = await this.octokit.repos.listCommits({
            owner: this.user.github.username,
            repo: this.repository.name,
            per_page: 1,
            sha: 'main'
        });
        return commits[0];
    };

    async createNewDeployment(githubDeploymentId){
        const pty = new PTYHandler(this.repository._id, this.repository);
        pty.removeFromRuntimeStoreAndKill();
        const environmentVariables = await this.readEnvironmentVariables();
        const currentDeployment = this.repository.deployments.pop();
        if(currentDeployment){
            const { environment } = await Deployment.findById(currentDeployment._id);
            for(const [key, value] of environment.variables.entries()){
                if(!(key in environmentVariables)){
                    continue;
                }
                environmentVariables[key] = value;
            }
        }
        const latestCommit = await this.getLatestCommit();
        const newDeployment = new Deployment({
            user: this.user._id,
            githubDeploymentId,
            repository: this.repository._id,
            environment: {
                variables: environmentVariables
            },
            commit: {
                message: latestCommit.commit.message,
                author: {
                    name: latestCommit.commit.author.name,
                    email: latestCommit.commit.author.email
                },
                status: 'pending'
            }
        });
        await newDeployment.save();
        return newDeployment;
    };

    async updateDeploymentStatus(deploymentId, state){
        await this.octokit.repos.createDeploymentStatus({
            owner: this.user.github.username,
            repo: this.repository.name,
            deployment_id: deploymentId,
            state
        });   
    };

    async createGithubDeployment(){
        const { data: { id: deploymentId } } = await this.octokit.repos.createDeployment({
            owner: this.user.github.username,
            repo: this.repository.name,
            ref: 'main',
            auto_merge: false,
            required_contexts: [],
            environment: 'Production'
        });
        if(!deploymentId)
            throw new RuntimeError('Deployment::Not::Created', 500);
        return deploymentId;
    };

    async getRepositoryDetails(){
        const { data: repositoryDetails } = await this.octokit.repos.get({
            owner: this.user.github.username,
            repo: this.repository.name
        });
        return repositoryDetails;
    };

    async getRepositoryInfo(){
        const latestCommit = await this.getLatestCommit();
        const details = await this.getRepositoryDetails();
        const information = {
            branch: details.default_branch,
            website: details.homepage,
            latestCommitMessage: latestCommit.commit.message,
            latestCommit: latestCommit.commit.author.date
        };
        return information;
    };

    async createWebhook(webhookUrl, webhookSecret){
        const response = await this.octokit.repos.createWebhook({
            owner: this.user.github.username,
            repo: this.repository.name,
            name: 'web',
            config: {
                url: webhookUrl,
                content_type: 'json',
                secret: webhookSecret
            },
            events: ['push'],
            active: true
        });
        const { id } = response.data;
        return id;
    };

    async deleteWebhook(){
        // Some repositories will not have a webhook, and this is because if 
        // the repository is archived (Read-Only) it will not allow 
        // updates, therefore no hooks.
        if(!this.repository.webhookId) return;
        try{
            const response = await this.octokit.repos.deleteWebhook({
                owner: this.user.github.username,
                repo: this.repository.name,
                hook_id: this.repository.webhookId
            });
            return response;
        }catch (error){
            console.error('[Quantum Cloud]: Error deleting webhook:', error.message);
            throw error;
        }
    };

    async getRepositoryDeployments(){
        const { data: deployments } = await this.octokit.repos.listDeployments({
            owner: this.user.github.username,
            repo: this.repository.name
        });
        return deployments;
    };

    async deleteRepositoryDeployment(deploymentId){
        await this.octokit.repos.deleteDeployment({
            owner: this.user.github.username,
            repo: this.repository.name,
            deployment_id: deploymentId
        });
    };

    async deployRepository(){
        await this.cloneRepository();
        global.ptyStore[this.repository._id] = PTYHandler.create(this.repository._id);
        const githubDeploymentId = await this.createGithubDeployment();
        const newDeployment = await this.createNewDeployment(githubDeploymentId);
        newDeployment.url = `https://github.com/${this.user.github.username}/${this.repository.name}/deployments/${githubDeploymentId}`;
        newDeployment.status = 'pending';
        await newDeployment.save();
        await this.updateDeploymentStatus(githubDeploymentId, 'in_progress');
        return newDeployment;
    };
};

module.exports = Github;