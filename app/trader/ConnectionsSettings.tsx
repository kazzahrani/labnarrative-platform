"use client";

import styles from "./overview-command-center.module.css";

type RealAccount = {
  id: string;
  name: string;
  exchangeStatus?: string;
  apiKeyLast4?: string | null;
} | null;
type Props = {
  realAccount: RealAccount;
  onConnectBinance: () => void;
  onBackOverview: () => void;
};

export default function ConnectionsSettings({ realAccount, onConnectBinance, onBackOverview }: Props) {
  const connected = realAccount?.exchangeStatus === "connected";
  return <div className={styles.connectionsPage}>
    <div className={styles.heading}>
      <div><small>SETTINGS</small><h1>Connections</h1><p>Manage the external accounts that supply balances, assets and execution access to LabNarrative.</p></div>
      <button type="button" className={styles.backButton} onClick={onBackOverview}>← Overview</button>
    </div>

    <section className={styles.connectionSection}>
      <div className={styles.sectionTitle}><div><small>EXCHANGES</small><h2>Exchange connections</h2><p>Connections are attached to your Real Account. Paper trading never requires an exchange.</p></div></div>
      <div className={styles.connectionCards}>
        <article className={styles.connectionCard}>
          <div className={styles.connectionBrand}><span>◆</span><div><b>Binance</b><small>Spot trading · API connection</small></div></div>
          <div className={styles.connectionMeta}><span className={connected ? styles.connectionGood : styles.connectionOffline}><i/>{connected ? "Connected" : "Not connected"}</span>{connected && realAccount?.apiKeyLast4 ? <small>Key ending ••••{realAccount.apiKeyLast4}</small> : <small>{realAccount ? "Real Account available" : "Real Account not initialized"}</small>}</div>
          <div className={styles.connectionCapabilities}><span>Balances</span><span>Spot orders</span><span>No withdrawals</span></div>
          <button type="button" className={connected ? styles.secondaryButton : styles.primary} onClick={onConnectBinance}>{connected ? "View connection" : "Connect Binance"}</button>
        </article>
      </div>
      <div className={styles.plannedConnections}><span><b>Coinbase</b><small>Planned</small></span><span><b>Bybit</b><small>Planned</small></span><span><b>KuCoin</b><small>Planned</small></span></div>
    </section>

    <section className={styles.connectionSection}>
      <div className={styles.sectionTitle}><div><small>WALLETS</small><h2>Wallet connections</h2><p>Wallet importing is not enabled yet, so LabNarrative does not currently read or store wallet addresses for the trading workspace.</p></div></div>
      <div className={styles.walletEmpty}><span>◇</span><div><b>No wallet connector enabled</b><small>This area is reserved for future read-only wallet portfolio connections. No nonfunctional connect button is shown until the feature is implemented.</small></div></div>
    </section>

    <section className={styles.securityNote}><span>✓</span><div><b>Connection security</b><p>Binance credentials are verified through the fixed-IP gateway and stored server-side. The current connection flow requires reading and Spot trading permissions while withdrawals and unsafe permissions remain disabled.</p></div></section>
  </div>;
}
