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

import createOperation from '@utilities/api/operationHandler';
import { getMyDockerImages } from '@services/docker/image/operations';
import { getMyDockerNetworks } from '@services/docker/network/operations';
import { getMyPortBindings } from '@services/portBinding/operations';
import { getMyProfile } from '@services/authentication/operations';
import * as dockerContainerSlice from '@services/docker/container/slice';
import * as dockerContainerService from '@services/docker/container/service'

export const getMyDockerContainers = ({ page = 1, limit = 50 } = {}) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.use({
        api: dockerContainerService.getMyDockerContainers,
        responseState: 'dockerContainers',
        loaderState: 'isLoading',
        statsState: 'stats',
        query: {
            queryParams: {
                page,
                limit,
                isRepositoryContainer: false,
                populate: JSON.stringify({
                    path: 'portBindings image',
                    select: 'externalPort name tag size'
                })
            }
        }
    });
};

export const countContainersByStatus = () => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.use({
        api: dockerContainerService.countContainersByStatus,
        loaderState: 'isContainersByStatusLoading',
        responseState: 'containersByStatus'
    });
};

export const setDockerStatus = (id, status) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.on('finally', () => {
        dispatch(getMyDockerContainers());
        dispatch(getMyProfile());
        dispatch(countContainersByStatus());
    });
    operation.use({
        api: dockerContainerService.setContainerStatus,
        loaderState: 'isOperationLoading',
        query: { params: { id } },
        body: { status }
    });
};

export const deleteDockerContainer = (id) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.on('finally', () => {
        dispatch(getMyDockerContainers());
        dispatch(getMyDockerNetworks());
        dispatch(getMyPortBindings());
        dispatch(getMyDockerImages());
        dispatch(countContainersByStatus());
        dispatch(getMyProfile());
    });
    operation.use({
        api: dockerContainerService.deleteDockerContainer,
        loaderState: 'isOperationLoading',
        query: { params: { id } }
    });
};

// duplicated code @services/repository/operations.js
export const storageExplorer = (id, route) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.use({
        api: dockerContainerService.storageExplorer,
        loaderState: 'isOperationLoading',
        responseState: 'containerFiles',
        query: { params: { id, route } }
    });
};

export const readContainerFile = (id, route) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.use({
        api: dockerContainerService.readContainerFile,
        loaderState: 'isOperationLoading',
        responseState: 'selectedContainerFile',
        query: { params: { id, route } }
    });
};

export const updateContainerFile = (id, route, content) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.use({
        api: dockerContainerService.updateContainerFile,
        loaderState: 'isOperationLoading',
        query: { params: { id, route } },
        body: { content }
    });
};

export const updateDockerContainer = (id, body, navigate) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.on('response', () => {
        navigate('/dashboard/');
    });
    operation.use({
        api: dockerContainerService.updateDockerContainer,
        loaderState: 'isOperationLoading',
        query: { params: { id } },
        body
    });
};

export const getRandomAvailablePort = () => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.use({
        api: dockerContainerService.getRandomAvailablePort,
        responseState: 'randomAvailablePort',
        loaderState: 'isRandomAvailablePortLoading'
    });
};

export const oneClickDeploy = (body, onResponse = () => {}) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.on('response', () => {
        dispatch(getMyDockerContainers());
        dispatch(getMyDockerNetworks());
        dispatch(getMyPortBindings());
        dispatch(getMyDockerImages());
        dispatch(getMyProfile());
        dispatch(countContainersByStatus());
        onResponse();
    });
    operation.use({
        api: dockerContainerService.oneClickDeploy,
        loaderState: 'isOneClickDeployLoading',
        body
    });
};

export const createDockerContainer = (body, navigate) => async (dispatch) => {
    const operation = createOperation(dockerContainerSlice, dispatch);
    operation.on('response', () => {
        navigate('/dashboard/');
        dispatch(getMyProfile());
        dispatch(countContainersByStatus());
    });
    operation.use({
        api: dockerContainerService.createDockerContainer,
        loaderState: 'isOperationLoading',
        body
    });
};