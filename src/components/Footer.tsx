import React from 'react';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p className={styles.text}>
          Made with <span className={styles.heart}>❤️</span> by{" "}
          <span className={styles.team}>Tim Anjab Bagian Organisasi Setda Kab. Muaro Jambi</span>
        </p>
        <div className={styles.tagline}>
          <span className={styles.hashtag}>#slavaukraini</span>
          <span className={styles.flags}>🇮🇩 x 🇺🇦</span>
        </div>
      </div>
    </footer>
  );
}
