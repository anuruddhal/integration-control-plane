/*
 * Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package org.wso2.dashboard.security.user.core;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.wso2.dashboard.security.user.core.common.AbstractUserStoreManager;
import org.wso2.dashboard.security.user.core.common.DataHolder;
import org.wso2.dashboard.security.user.core.file.FileBasedUserStoreManager;
import org.wso2.dashboard.security.user.core.jdbc.JDBCUserStoreManager;
import org.wso2.dashboard.security.user.core.ldap.ReadOnlyLDAPUserStoreManager;
import org.wso2.micro.integrator.security.user.api.RealmConfiguration;
import org.wso2.micro.integrator.security.user.api.UserStoreException;
import org.wso2.micro.integrator.security.user.api.UserStoreManager;

import java.util.Arrays;
import java.util.Hashtable;

import static org.wso2.dashboard.security.user.core.UserStoreConstants.DEFAULT_JDBC_USERSTORE_MANAGER;
import static org.wso2.dashboard.security.user.core.UserStoreConstants.DEFAULT_LDAP_USERSTORE_MANAGER;
import static org.wso2.dashboard.security.user.core.UserStoreConstants.DOMAIN_SEPARATOR;
import static org.wso2.dashboard.security.user.core.UserStoreConstants.SUPER_TENANT_ID;
import static org.wso2.micro.integrator.security.MicroIntegratorSecurityUtils.createObjectWithOptions;

public class UserStoreManagerUtils {
    private static final Log log = LogFactory.getLog(UserStoreManagerUtils.class);
    private static final String FILE_BASED_USER_STORE_PROPERTY = "is.user.store.file.based";

    public static boolean isAdminUser(String username) throws UserStoreException {
        if (isFileBasedUserStoreEnabled()) {
            return FileBasedUserStoreManager.getUserStoreManager().isAdmin(username);
        }
        // Secondary-store users never receive admin scope. The dashboard admin role is
        // defined against the primary store only; promoting a secondary user would also
        // bypass the AuthenticationFilter admin-only path checks.
        if (username != null && username.contains(DOMAIN_SEPARATOR)) {
            return false;
        }
        String[] roles = getUserStoreManager().getRoleListOfUser(username);
        return hasAdminRole(roles);
    }

    /**
     * Authenticate the user and return the canonical username identifying the matched store
     * (e.g. "LDAP/alice" when matched in a secondary, bare username when matched in primary).
     * Callers should use the returned name for any subsequent identity-bound lookup so it
     * routes to the same store that authenticated.
     */
    public static String authenticate(String username, Object credential) throws UserStoreException {
        UserStoreManager manager = getUserStoreManager();
        if (manager instanceof AbstractUserStoreManager) {
            return ((AbstractUserStoreManager) manager).authenticateAndResolve(username, credential);
        }
        if (manager.authenticate(username, credential)) {
            return username;
        }
        throw new UserStoreException("Authentication failure");
    }

    public static boolean isFileBasedUserStoreEnabled() {
        return Boolean.parseBoolean(System.getProperty(FILE_BASED_USER_STORE_PROPERTY));
    }

    public static UserStoreManager getUserStoreManager() throws UserStoreException {
        DataHolder dataHolder = DataHolder.getInstance();
        if (dataHolder.getUserStoreManager() == null) {
            initializeUserStore();
        }
        return dataHolder.getUserStoreManager();
    }

    private static void initializeUserStore() throws UserStoreException {
        DataHolder dataHolder = DataHolder.getInstance();
        if (isFileBasedUserStoreEnabled()) {
            dataHolder.setUserStoreManager(FileBasedUserStoreManager.getUserStoreManager());
            return;
        }
        RealmConfiguration config = RealmConfigXMLProcessor.createRealmConfig();
        if (config == null) {
            throw new UserStoreException("Unable to create Realm Configuration");
        }
        dataHolder.setRealmConfig(config);

        String userStoreMgtClassName = config.getUserStoreClass();
        UserStoreManager primaryManager = createUserStoreManager(userStoreMgtClassName, config);
        chainSecondaryUserStores(config, primaryManager);
        dataHolder.setUserStoreManager(primaryManager);
    }

    private static void chainSecondaryUserStores(RealmConfiguration primaryConfig, UserStoreManager primaryManager) {
        if (!(primaryManager instanceof AbstractUserStoreManager)) {
            return;
        }
        AbstractUserStoreManager abstractPrimary = (AbstractUserStoreManager) primaryManager;
        RealmConfiguration secondaryConfig = primaryConfig.getSecondaryRealmConfig();
        while (secondaryConfig != null) {
            String domainName = secondaryConfig.getUserStoreProperty(UserStoreConstants.RealmConfig.PROPERTY_DOMAIN_NAME);
            if (domainName == null) {
                log.warn("Skipping secondary user store with no DomainName configured.");
                secondaryConfig = secondaryConfig.getSecondaryRealmConfig();
                continue;
            }
            try {
                AbstractUserStoreManager secondaryManager = (AbstractUserStoreManager)
                        createUserStoreManager(secondaryConfig.getUserStoreClass(), secondaryConfig);
                AbstractUserStoreManager tail = abstractPrimary;
                while (tail.getSecondaryUserStoreManager() != null) {
                    tail = (AbstractUserStoreManager) tail.getSecondaryUserStoreManager();
                }
                tail.setSecondaryUserStoreManager(secondaryManager);
                abstractPrimary.addSecondaryUserStoreManager(domainName, secondaryManager);
                log.info("Secondary user store '" + domainName + "' added to the chain.");
            } catch (Exception e) {
                log.error("Failed to initialize secondary user store with domain '" + domainName + "'.", e);
            }
            secondaryConfig = secondaryConfig.getSecondaryRealmConfig();
        }
    }

    private static UserStoreManager createUserStoreManager(String userStoreManagerName, RealmConfiguration config)
            throws UserStoreException {
        switch (userStoreManagerName) {
            case DEFAULT_LDAP_USERSTORE_MANAGER: {
                return new ReadOnlyLDAPUserStoreManager(config, null, null);
            }
            case DEFAULT_JDBC_USERSTORE_MANAGER: {
                return new JDBCUserStoreManager(config, new Hashtable<>(), SUPER_TENANT_ID);
            }
            default: {
                return (UserStoreManager) createObjectWithOptions(userStoreManagerName, config);
            }
        }
    }

    private static boolean hasAdminRole(String[] roles) {
        return Arrays.stream(roles).anyMatch(UserStoreManagerUtils::isAdminRole);
    }

    public static boolean isAdminRole(String roleName) {
        RealmConfiguration realmConfig = DataHolder.getInstance().getRealmConfig();
        String adminRoleName = realmConfig.getAdminRoleName();
        return roleName.equalsIgnoreCase(adminRoleName);
    }

    public static boolean isUserStoreReadOnly(String username) throws UserStoreException {
        UserStoreManager manager = getUserStoreManager();
        if (username.contains(DOMAIN_SEPARATOR) && manager instanceof AbstractUserStoreManager) {
            String domain = username.substring(0, username.indexOf(DOMAIN_SEPARATOR));
            UserStoreManager secondary = ((AbstractUserStoreManager) manager).getSecondaryUserStoreManager(domain);
            if (secondary != null) {
                return secondary.isReadOnly();
            }
        }
        return manager.isReadOnly();
    }
}
