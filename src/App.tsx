import { ThemeProvider } from "@material-ui/core/styles";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Route, Redirect, Switch, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useMediaQuery } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import CssBaseline from "@material-ui/core/CssBaseline";
import useTheme from "./hooks/useTheme";
import useBonds from "./hooks/Bonds";
import { useAddress, useWeb3Context } from "./hooks/web3Context";
import useSegmentAnalytics from "./hooks/useSegmentAnalytics";
import { segmentUA } from "./helpers/userAnalyticHelpers";
import { shouldTriggerSafetyCheck, validateETHAddress } from "./helpers";

import { calcBondDetails } from "./slices/BondSlice";
import { loadAppDetails, setReferral } from "./slices/AppSlice";
import { loadAccountDetails, calculateUserBondDetails } from "./slices/AccountSlice";
import { info } from "./slices/MessagesSlice";

import { Stake, ChooseBond, Bond, Home, Referral } from "./views";
import Sidebar from "./components/Sidebar/Sidebar.jsx";
import TopBar from "./components/TopBar/TopBar.jsx";
import NavDrawer from "./components/Sidebar/NavDrawer.jsx";
import Messages from "./components/Messages/Messages";
import NotFound from "./views/404/NotFound";

import { dark as darkTheme } from "./themes/dark.js";
import { light as lightTheme } from "./themes/light.js";
import "./style.scss";
import Wrap from "./views/Wrap/Wrap";
import { useGoogleAnalytics } from "./hooks/useGoogleAnalytics";
import Calculator from "./views/Calculator/index";
import Nft from "./views/Nft/Nft";

// 😬 Sorry for all the console logging
const DEBUG = false;

// 🛰 providers
if (DEBUG) console.log("📡 Connecting to Mainnet Ethereum");
// 🔭 block explorer URL
// const blockExplorer = targetNetwork.blockExplorer;

const drawerWidth = 280;
const transitionDuration = 969;

const useStyles = makeStyles(theme => ({
  drawer: {
    [theme.breakpoints.up("md")]: {
      width: drawerWidth,
      flexShrink: 0,
    },
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing(1),
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: transitionDuration,
    }),
    height: "100%",
    overflow: "auto",
    marginLeft: drawerWidth,
  },
  contentShift: {
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.easeOut,
      duration: transitionDuration,
    }),
    marginLeft: 0,
  },
  // necessary for content to be below app bar
  toolbar: theme.mixins.toolbar,
  drawerPaper: {
    width: drawerWidth,
  },
}));

function useQuery() {
  const { search } = useLocation();

  return useMemo(() => new URLSearchParams(search), [search]);
}

function App() {
  // useSegmentAnalytics();
  useGoogleAnalytics();
  const location = useLocation();
  const dispatch = useDispatch();
  const [theme, toggleTheme, mounted] = useTheme();
  const currentPath = location.pathname + location.search + location.hash;
  const classes = useStyles();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSmallerScreen = useMediaQuery("(max-width: 980px)");
  const isSmallScreen = useMediaQuery("(max-width: 600px)");

  let query = useQuery();
  const refQuery = query.get("ref");
  if (refQuery) {
    dispatch(setReferral(refQuery));
  }

  const { connect, hasCachedProvider, provider, chainID, connected, uri } = useWeb3Context();
  const address = useAddress();

  const [walletChecked, setWalletChecked] = useState(false);

  // TODO (appleseed-expiredBonds): there may be a smarter way to refactor this
  // const isAppLoading = useSelector(state => !state.app?.marketPrice ?? true);
  // const isAppLoaded = useSelector(state => typeof state.app.marketPrice != "undefined"); // Hacky way of determining if we were able to load app Details.
  const { bonds, expiredBonds } = useBonds(chainID);
  console.log(`🚀 - App - bonds`, bonds, chainID);
  async function loadDetails(whichDetails: string) {
    // NOTE (unbanksy): If you encounter the following error:
    // Unhandled Rejection (Error): call revert exception (method="balanceOf(address)", errorArgs=null, errorName=null, errorSignature=null, reason=null, code=CALL_EXCEPTION, version=abi/5.4.0)
    // it's because the initial provider loaded always starts with chainID=1. This causes
    // address lookup on the wrong chain which then throws the error. To properly resolve this,
    // we shouldn't be initializing to chainID=1 in web3Context without first listening for the
    // network. To actually test rinkeby, change setChainID equal to 4 before testing.
    let loadProvider = provider; //{ ...provider, _network: { ...provider._network, chainId: 250 } };
    console.log(`🚀 - loadDetails - provider`, { loadProvider });
    console.log(`🚀 - loadDetails - loadProvider._isProvider`, loadProvider._isProvider);
    console.log(`🚀 - loadDetails - loadProvider._network`, loadProvider._network);
    console.log(`🚀 - loadDetails - loadProvider.anyNetwork`, loadProvider.anyNetwork);
    loadProvider._network.chainId = 250;

    if (whichDetails === "app") {
      loadApp(loadProvider);
    }

    // don't run unless provider is a Wallet...
    if (whichDetails === "account" && address && connected) {
      loadAccount(loadProvider);
    }
  }

  const loadApp = useCallback(
    loadProvider => {
      dispatch(loadAppDetails({ networkID: chainID, provider: loadProvider }));
      bonds.map(bond => {
        dispatch(calcBondDetails({ bond, value: "", provider: loadProvider, networkID: chainID }));
      });
    },
    [connected],
  );

  const loadAccount = useCallback(
    loadProvider => {
      dispatch(loadAccountDetails({ networkID: chainID, address, provider: loadProvider }));
      bonds.map(bond => {
        dispatch(calculateUserBondDetails({ address, bond, provider, networkID: chainID }));
      });
      expiredBonds.map(bond => {
        dispatch(calculateUserBondDetails({ address, bond, provider, networkID: chainID }));
      });
    },
    [connected],
  );

  // The next 3 useEffects handle initializing API Loads AFTER wallet is checked
  //
  // this useEffect checks Wallet Connection & then sets State for reload...
  // ... we don't try to fire Api Calls on initial load because web3Context is not set yet
  // ... if we don't wait we'll ALWAYS fire API calls via JsonRpc because provider has not
  // ... been reloaded within App.
  useEffect(() => {
    if (hasCachedProvider()) {
      // then user DOES have a wallet
      connect().then(() => {
        setWalletChecked(true);
      });
    } else {
      // then user DOES NOT have a wallet
      setWalletChecked(true);
    }
    if (shouldTriggerSafetyCheck()) {
      dispatch(info("Safety Check: Always verify you're on Fantom Dao!"));
    }
  }, []);

  // this useEffect fires on state change from above. It will ALWAYS fire AFTER
  useEffect(() => {
    // don't load ANY details until wallet is Checked
    if (walletChecked) {
      loadDetails("app");
    }
  }, [walletChecked]);

  // this useEffect picks up any time a user Connects via the button
  useEffect(() => {
    // don't load ANY details until wallet is Connected
    if (connected) {
      loadDetails("account");
    }
  }, [connected]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarExpanded(false);
  };

  let themeMode = darkTheme;

  useEffect(() => {
    themeMode = darkTheme;
  }, [theme]);

  useEffect(() => {
    if (isSidebarExpanded) handleSidebarClose();
  }, [location]);

  useEffect(() => {
    dispatch(loadAppDetails({ networkID: chainID, provider }));
    if (connected) {
      const updateAppDetailsInterval = setInterval(() => {
        bonds.map(bond => {
          dispatch(calcBondDetails({ bond, value: "", provider, networkID: chainID }));
        });
      }, 1000 * 60);
      return () => {
        clearInterval(updateAppDetailsInterval);
      };
    }
  }, [connected]);

  useEffect(() => {
    if (walletChecked) {
      const updateAccountDetailInterval = setInterval(() => {
        dispatch(loadAccountDetails({ networkID: chainID, address, provider: provider }));
        bonds.map(bond => {
          dispatch(calculateUserBondDetails({ address, bond, provider, networkID: chainID }));
        });
      }, 1000 * 60 * 10);
      return () => {
        clearInterval(updateAccountDetailInterval);
      };
    }
  }, [walletChecked]);

  return (
    <ThemeProvider theme={themeMode}>
      <CssBaseline />
      {/* {isAppLoading && <LoadingSplash />} */}
      <div className={`app ${isSmallerScreen && "tablet"} ${isSmallScreen && "mobile"} ${theme}`}>
        <Messages />

        <TopBar theme={theme} toggleTheme={toggleTheme} handleDrawerToggle={handleDrawerToggle} />
        <nav className={classes.drawer}>
          {isSmallerScreen ? (
            <NavDrawer mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle} />
          ) : (
            <Sidebar />
          )}
        </nav>

        <div className={`app-content ${classes.content} ${isSmallerScreen && classes.contentShift}`}>
          <div className="app-content__container">
            <Switch>
              <Route exact path="/">
                <Home />
              </Route>
              <Route path="/wrap">
                <Wrap />
              </Route>
              <Route path="/stake">
                <Stake />
              </Route>
              <Route path="/nft">
                <Nft />
              </Route>

              <Route path="/calculator">
                <Calculator />
              </Route>
              <Route path="/bonds">
                {bonds.map(bond => {
                  return (
                    <Route exact key={bond.name} path={`/bonds/${bond.name}`}>
                      <Bond bond={bond} />
                    </Route>
                  );
                })}
                <Route exact key="referral" path={`/bonds/referral`}>
                  <Referral />
                </Route>
                <ChooseBond />
              </Route>
              <Route component={NotFound} />
            </Switch>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
