import mongoose, { Schema, Model } from 'mongoose';
import { IDockerContainer } from '@typings/models/docker/container';
import DockerContainerService, { getContainerStoragePath, getSystemDockerName } from '@services/docker/container';
import UserContainerService from '@services/userContainer';
import logger from '@utilities/logger';

const DockerContainerSchema: Schema<IDockerContainer> = new Schema({
    isUserContainer: {
        type: Boolean,
        default: false
    },
    dockerContainerName: {
        type: String
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'DockerContainer::User::Required']
    },
    network: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DockerNetwork',
        required: [true, 'DockerContainer::Network::Required']
    },
    image: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DockerImage',
        required: [true, 'DockerContainer::Image::Required'],
    },
    storagePath: {
        type: String
    },
    status: {
        type: String,
        enum: ['created', 'running', 'stopped', 'restarting'],
        default: 'created'
    },
    command: {
        type: String
    },
    startedAt: {
        type: Date,
    },
    stoppedAt: {
        type: Date
    },
    environment: {
        variables: {
            type: Map,
            of: String,
            default: () => new Map()
        }
    },
    ipAddress: {
        type: String,
        default: ''
    },
    portBindings: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PortBinding'
    }],
    // can't change later
    name: {
        type: String,
        required: [true, 'DockerContainer::Name::Required']
    }
}, {
    timestamps: true
});

DockerContainerSchema.index({ user: 1, name: 1 }, { unique: true });

const cascadeDeleteHandler = async (document: IDockerContainer): Promise<void> => {
    if(!document) return;
    const { user, network, image, _id } = document;
    const containerService = new DockerContainerService(document);
    await containerService.removeContainer();
    const update = { $pull: { containers: _id } };
    await mongoose.model('User').updateOne({ _id: user }, update);
    await mongoose.model('DockerNetwork').updateOne({ _id: network }, update);
    await mongoose.model('DockerImage').updateOne({ _id: image }, update);
    await mongoose.model('PortBinding').deleteOne({ container: _id });
};

DockerContainerSchema.post('findOneAndDelete', async function (deletedDoc: IDockerContainer){
    await cascadeDeleteHandler(deletedDoc);
});

DockerContainerSchema.pre('deleteMany', async function(){
    const conditions = this.getQuery();
    const containers = await mongoose.model('DockerContainer').find(conditions);
    await Promise.all(containers.map(async (container: IDockerContainer) => {
        await cascadeDeleteHandler(container);
    }));
});

DockerContainerSchema.pre('findOneAndUpdate', async function (next){
    const update = this.getUpdate()
    if(!update){
        return next();
    }
    const modifiedPaths = Object.keys(update);
    if(modifiedPaths.includes('environment') || modifiedPaths.includes('command')){
        const doc = await this.model.findOne(this.getQuery());
        logger.debug(`@models/docker/container.ts (findOneAndUpdate): Recreating container (${doc.dockerContainerName}) with new environment variables...`);
        if(!doc) return;
        Object.assign(doc.environment, update.environment);
        const containerService = new DockerContainerService(doc);
        await containerService.recreateContainer();
        logger.debug(`@models/docker/container.ts (findOneAndUpdate): Recreated (${doc.dockerContainerName}).`);
    }
});

DockerContainerSchema.pre('save', async function (next){
    try{
        if(this.isNew){
            const containerId = this._id.toString();
            const userId = this.user.toString();
            const { containerStoragePath, userContainerPath } = getContainerStoragePath(userId, containerId, userId);
            this.dockerContainerName = getSystemDockerName(containerId);
            this.storagePath = this.isUserContainer ? userContainerPath : containerStoragePath;
            const containerService = new DockerContainerService(this);
            await containerService.createAndStartContainer();
            if(this.isUserContainer){
                await containerService.installDefaultPackages();
            }
            const ipAddress = await containerService.getIpAddress();
            if(ipAddress){
                this.ipAddress = ipAddress;
            }
            const update = { $push: { containers: this._id } };
            await mongoose.model('User').updateOne({ _id: this.user }, update);
            await mongoose.model('DockerImage').updateOne({ _id: this.image }, update);
            // TODO: Implement logic to be able to deploy the container with 
            // a different network, that is, one that can be changed.
            await mongoose.model('DockerNetwork').updateOne({ _id: this.network }, update);
        }
        next();
    }catch(error: any){
        next(error);
    }
});

const DockerContainer: Model<IDockerContainer> = mongoose.model('DockerContainer', DockerContainerSchema);

export default DockerContainer;