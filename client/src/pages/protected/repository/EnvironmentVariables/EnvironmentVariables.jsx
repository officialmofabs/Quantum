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

import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import EnvironmentVariables from '@components/organisms/EnvironmentVariables';
import * as deploymentSlice from '@services/deployment/slice';
import * as deploymentOperations from '@services/deployment/operations';
import './EnvironmentVariables.css';

const EnvironVariables = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { repositoryAlias } = useParams();
    const { selectedRepository } = useSelector((state) => state.repository);
    const { 
        isEnvironmentLoading, 
        isOperationLoading, 
        environment } = useSelector((state) => state.deployment);

    useEffect(() => {
        initializeEnvironment();
    }, []);

    const initializeEnvironment = () => {
        if(!selectedRepository) return navigate('/dashboard/');
        dispatch(deploymentOperations.getActiveDeploymentEnvironment(selectedRepository.alias));
    };

    const onUpdateVariable = (_, variables) => {
        dispatch(deploymentSlice.setState({
            path: 'environment',
            value: { ...environment, variables }
        }));
    };

    const handleEnvironmentUpdate = (updatedEnvironment) => {
        const body = { environment: updatedEnvironment }
        dispatch(deploymentOperations.updateDeployment(environment._id, body, navigate));
    };

    const handleCreateNew = (variables) => {
        dispatch(deploymentSlice.setState({
            path: 'environment',
            value: { ...environment, variables }
        }));
    };

    return <EnvironmentVariables
        title='Environment Variables'
        description='To provide your implementation with environment variables at compile and run time, you can enter them right here. If there are any .env files in the root of your repository, these are mapped and loaded automatically when deploying.'
        handleCreateNew={handleCreateNew}
        handleSave={handleEnvironmentUpdate}
        onUpdateVariable={onUpdateVariable}
        isOperationLoading={isOperationLoading}
        isEnvironmentLoading={isEnvironmentLoading}
        environment={environment}
        breadcrumbs={[
            { title: 'Home', to: '/' },
            { title: 'Dashboard', to: '/dashboard/' },
            { title: repositoryAlias, to: '/dashboard/' },
            { title: 'Environment Variables', to: `/repository/${repositoryAlias}/deployment/environment-variables/` }
        ]}
    />
};

export default EnvironVariables;