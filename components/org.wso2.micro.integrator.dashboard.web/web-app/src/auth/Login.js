/*
 * Copyright (c) 2021, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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
import {Helmet} from "react-helmet";
import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import CssBaseline from '@material-ui/core/CssBaseline';
import TextField from '@material-ui/core/TextField';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import Typography from '@material-ui/core/Typography';
import Container from '@material-ui/core/Container';
import Link from '@material-ui/core/Link';
import Grid from '@material-ui/core/Grid';
import Box from '@material-ui/core/Box';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import { Redirect } from 'react-router';
import AuthManager from './AuthManager'

const styles = theme => ({
    paper: {
        marginTop: theme.spacing(8),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    avatar: {
        margin: theme.spacing(1),
        backgroundColor: theme.palette.secondary.main,
    },
    form: {
        width: '100%', // Fix IE 11 issue.
        marginTop: theme.spacing(1),
    },
    submit: {
        margin: theme.spacing(3, 0, 2),
    },
});
/**
 * Login page.
 */
class Login extends Component {
    /**
     * Constructor.
     *
     * @param {{}} props Props
     */
    constructor(props) {
        super(props);
        this.state = {
            username: '',
            password: '',
            authenticated: false
        };
        this.authenticate = this.authenticate.bind(this);
        this.handleLoginErrorDialogClose = this.handleLoginErrorDialogClose.bind(this);
    }

    componentWillMount() {
        this.initAuthenticationFlow();
    }

    /**
     * Check if the user has already signed in and remember me is set
     */
    initAuthenticationFlow() {
        if (!AuthManager.isLoggedIn()) {
            this.setState({ authenticated: false })
        } else {
            this.setState({ authenticated: true })
        }
    }

    authenticate(e) {
        const { username, password } = this.state;
        e.preventDefault();

        AuthManager.authenticate(username, password, false)
            .then(() => { this.setState({ authenticated: true }) })
            .catch((error) => {
                console.log("Authentication failed with error :: " + error);
                let errorMessage;
                if (error.response && error.response.status === 401) {
                    errorMessage = 'Incorrect username or password!';
                } else {
                    errorMessage = "Error occurred in communication. Please check server logs."
                }
                this.setState({
                    username: '',
                    password: '',
                    loginErrorMessage: errorMessage,
                    loginError: true,
                });
            });
    }

    handleLoginErrorDialogClose() {
        this.setState({ loginError: false, loginErrorMessage: '' });
    }

    /**
     * Render default login page.
     *
     * @return {XML} HTML content
     */
    renderDefaultLogin() {
        const { classes } = this.props;

        const { username, password } = this.state;
        return (
            <Container component="main" maxWidth="xs">
                <Helmet>
                    <title>Login - Micro Integrator Dashboard</title>
                </Helmet>
                <CssBaseline />
                <div className={classes.paper}>
                    <img
                        alt='logo'
                        src='/logo-inverse.svg'
                        width={200}
                    />
                    <Box mt={4}>
                        <Typography component="h1" variant="h5">
                            Sign in
                        </Typography>
                    </Box>

                    <form className={classes.form} noValidate>
                        <TextField
                            variant="outlined"
                            margin="normal"
                            required
                            fullWidth
                            id="username"
                            label="Username"
                            name="username"
                            autoComplete="off"
                            value={username}
                            onChange={(e) => {
                                this.setState({
                                    username: e.target.value,
                                });
                            }}
                            autoFocus
                        />
                        <TextField
                            variant="outlined"
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label="Password"
                            type="password"
                            id="password"
                            value={password}
                            autoComplete="off"
                            onChange={(e) => {
                                this.setState({
                                    password: e.target.value,
                                });
                            }}
                        />
                        <FormControlLabel
                            control={<Checkbox value="remember" color="primary" />}
                            label="Remember me"
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            color="primary"
                            className={classes.submit}
                            disabled={username === '' || password === ''}
                            onClick={this.authenticate}
                        >
                            Sign In
                </Button>
                        <Grid container>
                            <Grid item xs>
                                <Link href="#" variant="body2">
                                    Forgot password?
                    </Link>
                            </Grid>
                            <Grid item>
                                <Link href="#" variant="body2">
                                    {"Don't have an account? Sign Up"}
                                </Link>
                            </Grid>
                        </Grid>
                    </form>
                </div>
                <Box mt={8}>
                    <Typography variant="body2" color="textSecondary" align="center">
                        {`© 2005 - ${new Date().getFullYear()} WSO2 Inc. All Rights Reserved.`}
                    </Typography>
                </Box>
                <Dialog open={this.state.loginError} onClose={this.handleLoginErrorDialogClose}
                    aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
                    <DialogTitle id="alert-dialog-title">{"Login Failed"}</DialogTitle>
                    <DialogContent dividers>
                        <DialogContentText id="alert-dialog-description">
                            {this.state.loginErrorMessage}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={this.handleLoginErrorDialogClose} color="primary" autoFocus>
                            OK
                        </Button>
                    </DialogActions>
                </Dialog>
            </Container>

        );
    }

    render() {
        const authenticated = this.state.authenticated;
        if (authenticated) {
            return <Redirect to="/" />
        }
        return this.renderDefaultLogin();
    }
}

export default withStyles(styles)(Login);
