import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';

/**
 * LeafletSosMap
 * Renders real OpenStreetMap tiles via Leaflet.js with live pulsating SOS markers.
 *
 * @param {Array} incidents - List of SOS incidents / cases with coordinates
 * @param {Array} defaultCenter - [lat, lng] fallback center (default: India center [20.5937, 78.9629])
 * @param {number} defaultZoom - fallback zoom level
 * @param {string} height - CSS height string (e.g. '380px')
 * @param {string} title - optional map header title
 */
export default function LeafletSosMap({
  incidents = [],
  defaultCenter = [19.7515, 75.7139], // Maharashtra geographic centroid default
  defaultZoom = 7,
  height = '360px',
  title = 'Live Emergency Geolocation & SOS Incident Radar',
  onMarkerClick = null,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const navigate = useNavigate();

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
      attributionControl: true,
    });

    // Add OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | AAVAZ Telemetry',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when incidents change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    const validIncidents = incidents.filter(
      (item) =>
        item &&
        item.location_lat != null &&
        item.location_lng != null &&
        !isNaN(Number(item.location_lat)) &&
        !isNaN(Number(item.location_lng))
    );

    const latLngBounds = [];

    validIncidents.forEach((item) => {
      const lat = Number(item.location_lat);
      const lng = Number(item.location_lng);
      latLngBounds.push([lat, lng]);

      const score = Math.round(item.distress_score ?? item.current_distress_score ?? 90);
      const isCritical = score >= 75 || item.is_sos || item.resolved === false;
      const caseCode = (item.case_code || item.case_id || item.id || 'SOS').substring(0, 10).toUpperCase();
      const timeStr = item.triggered_at
        ? new Date(item.triggered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : 'Active Now';

      // Create Custom Animated Pulse HTML Marker
      const markerHtml = `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: ${isCritical ? 'rgba(220, 38, 38, 0.35)' : 'rgba(234, 88, 12, 0.35)'}; animation: sos-pulse-ring 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;"></div>
          <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: ${isCritical ? '#dc2626' : '#ea580c'}; border: 2.5px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 10px; font-weight: 800;">
            ${score}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'aavaz-leaflet-sos-icon',
        html: markerHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      // Build rich popup content
      const popupContent = document.createElement('div');
      popupContent.style.fontFamily = 'Inter, sans-serif';
      popupContent.style.padding = '4px';
      popupContent.style.minWidth = '220px';
      popupContent.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
          <span style="font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: #dc2626; text-transform: uppercase;">
            🚨 SOS EMERGENCY
          </span>
          <span style="font-size: 11px; font-weight: 700; color: #64748b; font-family: monospace;">
            ${timeStr}
          </span>
        </div>
        <div style="margin-bottom: 6px;">
          <div style="font-weight: 700; font-size: 14px; color: #0f172a; font-family: 'Plus Jakarta Sans', sans-serif;">
            Case #${caseCode}
          </div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">
            ${item.user_name || 'Survivor Protection Profile'}
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #f8fafc; padding: 6px 8px; border-radius: 6px; margin-bottom: 8px; font-size: 11px;">
          <div>
            <span style="color: #64748b;">Distress:</span>
            <span style="font-weight: 800; color: #dc2626; margin-left: 4px;">${score}/100</span>
          </div>
          <div>
            <span style="color: #64748b;">Coords:</span>
            <span style="font-weight: 600; color: #0f172a; margin-left: 4px;">${lat.toFixed(2)}, ${lng.toFixed(2)}</span>
          </div>
        </div>
        <button id="sos-popup-btn-${item.id || item.case_id}" style="width: 100%; padding: 6px 12px; border-radius: 6px; background: #dc2626; color: #ffffff; border: none; font-size: 12px; font-weight: 700; cursor: pointer; transition: opacity 120ms ease;">
          Manage Case Dossier →
        </button>
      `;

      // Attach button click handler
      const targetCaseId = item.case_id || item.id;
      marker.bindPopup(popupContent);
      marker.on('popupopen', () => {
        const btn = document.getElementById(`sos-popup-btn-${item.id || item.case_id}`);
        if (btn) {
          btn.onclick = () => {
            if (onMarkerClick) {
              onMarkerClick(item);
            } else {
              navigate(`/admin/case/${targetCaseId}`);
            }
          };
        }
      });

      markersLayer.addLayer(marker);
    });

    // Auto-fit bounds if we have incidents
    if (latLngBounds.length > 0) {
      if (latLngBounds.length === 1) {
        map.setView(latLngBounds[0], 12);
      } else {
        map.fitBounds(latLngBounds, { padding: [40, 40], maxZoom: 14 });
      }
    } else {
      map.setView(defaultCenter, defaultZoom);
    }
  }, [incidents, defaultCenter, defaultZoom, navigate, onMarkerClick]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: '1rem',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        background: '#ffffff',
      }}
    >
      <style>{`
        @keyframes sos-pulse-ring {
          0% { transform: scale(0.6); opacity: 0.9; }
          50% { transform: scale(1.6); opacity: 0.3; }
          100% { transform: scale(2.0); opacity: 0; }
        }
        .aavaz-leaflet-sos-icon {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
          padding: 4px !important;
        }
      `}</style>

      {/* Map Header Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'rgba(255, 255, 255, 0.96)',
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: incidents.length > 0 ? '#dc2626' : '#10b981',
              boxShadow: incidents.length > 0 ? '0 0 8px #dc2626' : 'none',
              animation: incidents.length > 0 ? 'sos-pulse-ring 1.5s infinite' : 'none',
            }}
          />
          <h3
            style={{
              margin: 0,
              fontSize: '0.875rem',
              fontWeight: 700,
              color: '#0f172a',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            {title}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              background: incidents.length > 0 ? '#ffdad6' : '#ecfdf5',
              color: incidents.length > 0 ? '#93000a' : '#047857',
              fontSize: '0.6875rem',
              fontWeight: 700,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {incidents.length} Active Incident{incidents.length !== 1 ? 's' : ''} on OpenStreetMap
          </span>
        </div>
      </div>

      {/* Leaflet Map Canvas Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height, zIndex: 10 }} />
    </div>
  );
}
