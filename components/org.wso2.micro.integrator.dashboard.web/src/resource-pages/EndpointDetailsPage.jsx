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


import React, {Component} from 'react';
import ResourceExplorerParent from '../common/ResourceExplorerParent';
import SourceViewComponent from '../common/SourceViewComponent';
import ResourceAPI from '../utils/apis/ResourceAPI';
import queryString from 'query-string'
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import TableHeaderBox from '../common/TableHeaderBox';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import Box from '@material-ui/core/Box';
import { Link } from "react-router-dom";
import Switch from "react-switch";
import * as Constants from "../utils/Constants";

export default class EndpointDetailsPage extends Component {

    constructor(props) {
        super(props);
        this.state = {
            response: {},
            error: null
        };
    }

    /**
     * Retrieve endpoint details from the MI.
     */
    componentDidMount() {
        let url = this.props.location.search;
        const values = queryString.parse(url) || {};
        this.retrieveEndpointInfo(values.name);
    }

    createData(name, value) {
        return {name, value};
    }

    retrieveEndpointInfo(name) {
        new ResourceAPI().getEndpointByName(name).then((response) => {
            this.setState(
                {
                    response: response.data,
                });
        }).catch((error) => {
            this.setState({error:error})
        });
    }

    renderEndpointDetails() {

        return (
            <Box>
                <Box pb={5}>
                    <TableHeaderBox title="Endpoint Details"/>
                    {this.renderData(this.state.response)}
                </Box>
                <SourceViewComponent config={this.state.response.configuration}/>
            </Box>
        );
    }

    renderData(endpoint) {
        const type = endpoint.type;
        if (type === "HTTP Endpoint") {
            return this.renderHttpEPOptions(endpoint);
        } else if (type === "Address Endpoint") {
            return this.renderAddressingEPOptions(endpoint);
        } else if (type === "WSDL Endpoint") {
            return this.renderWsdlEPOptions(endpoint);
        } else if (type === "Template Endpoint") {
            return this.renderTemplateEPOptions(endpoint);
        } else if (type === "Recipient List Endpoint") {
            return this.renderListEPOptions(endpoint);
        } else if (type === "Load Balance Endpoint") {
            return this.renderLBEPOptions(endpoint);
        } else if (type === "Failover Endpoint") {
            return this.renderFailoverEPOptions(endpoint);
        } else if (type === "Default Endpoint") {
            return this.renderDefaultEPOptions(endpoint);
        } else if (type === "Indirect Endpoint") {
           return this.renderIndirectEndpoint(endpoint);
        }
    }

    renderHttpEPOptions(endpoint) {
        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Method", endpoint.method));
        options.push(this.createData("URI Template", endpoint.uriTemplate));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Table size="small">
                <TableBody>
                    {this.renderRowsFromData(options)}
                </TableBody>
            </Table>);
    }

    renderAddressingEPOptions(endpoint) {
        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Address", endpoint.address));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Table size="small">
                <TableBody>
                    {this.renderRowsFromData(options)}
                </TableBody>
            </Table>);
    }

    renderWsdlEPOptions(endpoint) {
        const options = [];

        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("WSDL URI", endpoint.wsdlUri));
        options.push(this.createData("Service", endpoint.serviceName));
        options.push(this.createData("Port", endpoint.portName));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Table size="small">
                <TableBody>
                    {this.renderRowsFromData(options)}
                </TableBody>
            </Table>);
    }

    renderTemplateEPOptions(endpoint) {

        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Template", endpoint.template));
        options.push(this.createData("URI", endpoint.parameters.uri));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Table size="small">
                <TableBody>
                    {this.renderRowsFromData(options)}
                </TableBody>
            </Table>);
    }

    renderListEPOptions(endpoint) {
        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Box>
                <Table size="small">
                    <TableBody>
                        {this.renderRowsFromData(options)}
                    </TableBody>
                </Table>
                <Box paddingTop={5}>
                    <TableHeaderBox title="Endpoint Children"/>
                    {this.renderChildEndpoints(endpoint.children)}
                </Box>
            </Box>);
    }

    renderLBEPOptions(endpoint) {
        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Box>
                <Table size="small">
                    <TableBody>
                        {this.renderRowsFromData(options)}
                    </TableBody>
                </Table>
                <Box paddingTop={5}>
                    <TableHeaderBox title="Endpoint Children"/>
                    {this.renderChildEndpoints(endpoint.children)}
                </Box>
            </Box>);
    }

    renderFailoverEPOptions(endpoint) {
        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Box>
                <Table size="small">
                    <TableBody>
                        {this.renderRowsFromData(options)}
                    </TableBody>
                </Table>
                <Box paddingTop={5}>
                    <TableHeaderBox title="Endpoint Children"/>
                    {this.renderChildEndpoints(endpoint.children)}
                </Box>
            </Box>);
    }

    renderDefaultEPOptions(endpoint) {
        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Table size="small">
                <TableBody>
                    {this.renderRowsFromData(options)}
                </TableBody>
            </Table>);
    }

    renderIndirectEndpoint(endpoint) {
        const options = [];
        options.push(this.createData("Name", endpoint.name));
        options.push(this.createData("Type", endpoint.type));
        options.push(this.createData("Key", endpoint.key));
        options.push(this.createData("Tracing", endpoint.tracing === "enabled"));
        return (
            <Table size="small">
                <TableBody>
                    {this.renderRowsFromData(options)}
                </TableBody>
            </Table>);
    }

    renderRowsFromData(data) {
        return (
            data.map(row => (
                row.name == "Tracing" ?
                    (
                        <TableRow>
                            <TableCell>{row.name}</TableCell>
                            <TableCell>
                                <Switch height={Constants.detailsPageSwitchAttributes.Height} width={Constants.detailsPageSwitchAttributes.Width}
                                        onChange={updatedState => this.handleTraceUpdate(this.state.response.name, updatedState)}
                                        checked={row.value}/>
                            </TableCell>
                        </TableRow>
                    )
                    :
                    (
                        <TableRow>
                            <TableCell>{row.name}</TableCell>
                            <TableCell>{row.value}</TableCell>
                        </TableRow>
                    )
            ))
        );
    }

    renderChildEndpoints(children) {
        return (
            children.map(row => (
                <ExpansionPanel>
                    <ExpansionPanelSummary
                        expandIcon={<ExpandMoreIcon/>}
                        aria-controls="panel1a-content"
                        id="panel1a-header">
                        {row.name}
                    </ExpansionPanelSummary>
                    <ExpansionPanelDetails>
                        {this.renderData(row)}
                    </ExpansionPanelDetails>
                </ExpansionPanel>
            ))

        );
    }

    renderBreadCrumbs() {
        return (
            <div style={{display:"flex"}}>
                <Box color="inherit" component={Link} to="/endpoint">Endpoints</Box>
                <Box color="textPrimary">&nbsp;>&nbsp;</Box>
                <Box color="textPrimary"> {this.state.response.name}</Box>
            </div>
        );
    }

    handleTraceUpdate(endpointName, currentState) {
        let traceState = "disable";
        if (currentState) {
            traceState = "enable";
        }
        new ResourceAPI().handleEndpointTraceLevelUpdate(endpointName, traceState).then((response) => {
            this.retrieveEndpointInfo(endpointName);
        }).catch((error) => {
            if (error.request) {
                this.setState({errorOccurred: true}, function () {
                });
            }
        });
    }

    render() {
        return (
            <ResourceExplorerParent
                title={this.renderBreadCrumbs()}
                content={this.renderEndpointDetails()}
                error={this.state.error}/>
        );
    }
}
