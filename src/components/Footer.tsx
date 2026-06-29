"use client";

import React, { useState, useEffect } from 'react';
import styles from './Footer.module.css';
import { api } from '@/lib/api';

export default function Footer() {
  const [showSupport, setShowSupport] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem('sianjab_show_slava_ukraini');
      return local !== null ? local === 'true' : true;
    }
    return true;
  });

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const res = await api.getFooterSetting();
        if (res && res.showSlavaUkraini !== undefined) {
          setShowSupport(res.showSlavaUkraini);
          localStorage.setItem('sianjab_show_slava_ukraini', String(res.showSlavaUkraini));
        }
      } catch (err) {
        console.error("Gagal memuat setting footer:", err);
      }
    };
    fetchSetting();
  }, []);

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p className={styles.text}>
          Made with <span className={styles.heart}>❤️</span> by{" "}
          <span className={styles.team}>Tim Anjab Bagian Organisasi Setda Kab. Muaro Jambi</span>
        </p>
        {showSupport && (
          <div className={styles.tagline}>
            <span className={styles.hashtag}>#slavaukraini</span>
            <span className={styles.flags}>🇮🇩 x 🇺🇦</span>
          </div>
        )}
      </div>
    </footer>
  );
}
