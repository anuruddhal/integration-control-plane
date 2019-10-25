/*
 * Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { Component } from 'react';
import AuthManager from './utils/AuthManager';
import {Redirect} from 'react-router';

export default class Logout extends Component {

    constructor(props) {
        super(props);
        this.state = {
            loggedOut: false
        }
    }

    componentWillMount() {
        AuthManager.logout()
            .then(() => {
               this.setState({
                   loggedOut: true
               });
            });
    }


    render() {
        if (this.state.loggedOut) {
            return <Redirect to="/login"/>
        }
        return "";
    }
}