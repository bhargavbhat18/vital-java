import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

const GoogleMapTracking = ({
  patientLocation,
  ambulanceLocation,
  hospitalLocation,
  ambulanceStatus,
  ambulanceUnitId,
  driverName,
  emergencyId,
  followAmbulance = false,
  showRoute = true,
  height = '400px',
  onMapLoad,
  onLocationUpdate
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const loaderRef = useRef(null);
  
  const markersRef = useRef({
    patient: null,
    ambulance: null,
    hospital: null
  });
  
  const routePolylineRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const isMapReadyRef = useRef(false);
  const lastAmbulanceLocationRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [mapError, setMapError] = useState(null);
  const [distance, setDistance] = useState(null);
  const [eta, setEta] = useState(null);

  const getApiKey = () => {
    return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  };

  const initializeMap = useCallback(async () => {
    if (isMapReadyRef.current || !mapRef.current) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      setMapError('Google Maps API key not configured. Please set VITE_GOOGLE_MAPS_API_KEY environment variable.');
      return;
    }

    try {
      loaderRef.current = new Loader({
        apiKey,
        version: 'weekly',
        libraries: ['routes', 'marker']
      });

      const { Map, Marker, Polyline, DirectionsService, DirectionsRenderer } = await loaderRef.current.importLibrary('maps');
      const { AdvancedMarkerElement, PinElement } = await loaderRef.current.importLibrary('marker');

      const defaultLat = patientLocation?.[0] || ambulanceLocation?.[0] || hospitalLocation?.[0] || 12.9716;
      const defaultLng = patientLocation?.[1] || ambulanceLocation?.[1] || hospitalLocation?.[1] || 77.5946;

      const map = new Map(mapRef.current, {
        center: { lat: defaultLat, lng: defaultLng },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      mapInstanceRef.current = map;
      isMapReadyRef.current = true;

      directionsServiceRef.current = new DirectionsService();
      directionsRendererRef.current = new DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#ef4444',
          strokeWeight: 4,
          strokeOpacity: 0.7,
        }
      });

      if (onMapLoad) onMapLoad(map);

      updateMarkers(map, AdvancedMarkerElement, PinElement);
      if (showRoute) updateRoute();

    } catch (error) {
      console.error('Failed to initialize Google Maps:', error);
      setMapError('Failed to load Google Maps. Please check API key and network connection.');
    }
  }, [patientLocation, ambulanceLocation, hospitalLocation, showRoute, onMapLoad]);

  const createMarker = (map, AdvancedMarkerElement, PinElement, position, title, iconType) => {
    const colors = {
      patient: '#10b981',
      ambulance: '#ef4444',
      hospital: '#3b82f6'
    };

    const icons = {
      patient: '👤',
      ambulance: '🚑',
      hospital: '🏥'
    };

    const pin = new PinElement({
      background: colors[iconType],
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: iconType === 'ambulance' ? 1.3 : 1
    });

    const marker = new AdvancedMarkerElement({
      map,
      position,
      title,
      content: pin.element
    });

    return marker;
  };

  const updateMarkers = useCallback((map, AdvancedMarkerElement, PinElement) => {
    if (!map || !AdvancedMarkerElement || !PinElement) return;

    // Patient marker
    if (patientLocation && patientLocation[0] && patientLocation[1]) {
      const pos = { lat: patientLocation[0], lng: patientLocation[1] };
      if (markersRef.current.patient) {
        markersRef.current.patient.position = pos;
      } else {
        markersRef.current.patient = createMarker(map, AdvancedMarkerElement, PinElement, pos, 'Patient Location', 'patient');
      }
    } else if (markersRef.current.patient) {
      markersRef.current.patient.map = null;
      markersRef.current.patient = null;
    }

    // Hospital marker
    if (hospitalLocation && hospitalLocation[0] && hospitalLocation[1]) {
      const pos = { lat: hospitalLocation[0], lng: hospitalLocation[1] };
      if (markersRef.current.hospital) {
        markersRef.current.hospital.position = pos;
      } else {
        markersRef.current.hospital = createMarker(map, AdvancedMarkerElement, PinElement, pos, 'Hospital', 'hospital');
      }
    } else if (markersRef.current.hospital) {
      markersRef.current.hospital.map = null;
      markersRef.current.hospital = null;
    }

    // Ambulance marker with smooth animation
    if (ambulanceLocation && ambulanceLocation[0] && ambulanceLocation[1]) {
      const pos = { lat: ambulanceLocation[0], lng: ambulanceLocation[1] };
      
      if (markersRef.current.ambulance) {
        // Smooth animation to new position
        animateMarker(markersRef.current.ambulance, pos);
      } else {
        markersRef.current.ambulance = createMarker(map, AdvancedMarkerElement, PinElement, pos, 
          `Ambulance ${ambulanceUnitId || ''} - ${ambulanceStatus || 'Active'}`, 'ambulance');
      }
      
      lastAmbulanceLocationRef.current = pos;
      
      // Auto-follow ambulance if enabled
      if (followAmbulance) {
        map.panTo(pos);
      }
    } else if (markersRef.current.ambulance) {
      markersRef.current.ambulance.map = null;
      markersRef.current.ambulance = null;
    }
  }, [patientLocation, ambulanceLocation, hospitalLocation, ambulanceStatus, ambulanceUnitId, followAmbulance]);

  const animateMarker = (marker, newPosition) => {
    if (!marker || !marker.position) return;
    
    const start = marker.position;
    const end = newPosition;
    const duration = 1000; // 1 second animation
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth movement
      const eased = progress < 0.5 
        ? 2 * progress * progress 
        : -1 + (4 - 2 * progress) * progress;
      
      const lat = start.lat + (end.lat - start.lat) * eased;
      const lng = start.lng + (end.lng - start.lng) * eased;
      
      marker.position = { lat, lng };
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animate();
  };

  const updateRoute = useCallback(async () => {
    if (!directionsServiceRef.current || !directionsRendererRef.current) return;
    
    const map = mapInstanceRef.current;
    if (!map) return;

    // Determine route based on ambulance status
    let origin = null;
    let destination = null;
    
    if (ambulanceLocation && ambulanceLocation[0] && ambulanceLocation[1]) {
      origin = { lat: ambulanceLocation[0], lng: ambulanceLocation[1] };
    }
    
    // Route logic based on status
    const isEnRouteToPatient = ['EN_ROUTE_TO_PATIENT', 'ACCEPTED', 'AMBULANCE_DISPATCHED', 'REQUESTED'].includes(ambulanceStatus);
    const isPatientPickedUp = ['PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL', 'ARRIVED_AT_HOSPITAL'].includes(ambulanceStatus);
    
    if (isEnRouteToPatient && patientLocation && patientLocation[0] && patientLocation[1]) {
      destination = { lat: patientLocation[0], lng: patientLocation[1] };
    } else if (isPatientPickedUp && hospitalLocation && hospitalLocation[0] && hospitalLocation[1]) {
      destination = { lat: hospitalLocation[0], lng: hospitalLocation[1] };
    }
    
    if (!origin || !destination) {
      directionsRendererRef.current.setDirections({ routes: [] });
      setDistance(null);
      setEta(null);
      return;
    }

    try {
      const result = await directionsServiceRef.current.route({
        origin,
        destination,
        travelMode: 'DRIVING',
        avoidTolls: false,
        avoidHighways: false
      });

      directionsRendererRef.current.setDirections(result);

      // Extract distance and duration
      if (result.routes && result.routes[0] && result.routes[0].legs && result.routes[0].legs[0]) {
        const leg = result.routes[0].legs[0];
        if (leg.distance) {
          const distKm = leg.distance.value / 1000;
          setDistance(distKm.toFixed(1));
        }
        if (leg.duration) {
          const durMin = Math.round(leg.duration.value / 60);
          setEta(durMin);
        }
      }
    } catch (error) {
      console.error('Failed to calculate route:', error);
      setDistance(null);
      setEta(null);
    }
  }, [ambulanceLocation, patientLocation, hospitalLocation, ambulanceStatus]);

  // Initialize map on mount
  useEffect(() => {
    initializeMap();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
        isMapReadyRef.current = false;
      }
    };
  }, [initializeMap]);

  // Update markers and route when locations change
  useEffect(() => {
    if (!isMapReadyRef.current) return;
    
    if (loaderRef.current) {
      loaderRef.current.importLibrary('marker').then(({ AdvancedMarkerElement, PinElement }) => {
        const map = mapInstanceRef.current;
        if (map) {
          updateMarkers(map, AdvancedMarkerElement, PinElement);
        }
      });
    }
    
    if (showRoute) {
      updateRoute();
    }
  }, [patientLocation, ambulanceLocation, hospitalLocation, ambulanceStatus, showRoute, updateMarkers, updateRoute]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        google.maps.event.trigger(mapInstanceRef.current, 'resize');
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (mapError) {
    return (
      <div style={{ 
        width: '100%', 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f5f5f5',
        borderRadius: '12px',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <p style={{ color: 'var(--accent-red)', fontWeight: 600 }}>⚠️ Map Unavailable</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>{mapError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Status Info Overlay */}
      {(distance !== null || eta !== null) && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          right: '16px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: '12px',
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          border: '1px solid var(--border-color)',
          zIndex: 100
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🚑</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {ambulanceUnitId ? `Ambulance ${ambulanceUnitId}` : 'Ambulance'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {ambulanceStatus} {driverName && `- ${driverName}`}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              {distance !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>📏</span>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>DISTANCE</div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{distance} km</div>
                  </div>
                </div>
              )}
              {eta !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>⏱️</span>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>ETA</div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent-blue)' }}>{eta} min</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Follow Ambulance Toggle */}
      {followAmbulance && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: '8px',
          padding: '8px 12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          border: '1px solid var(--border-color)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--accent-blue)'
        }}>
          🎯 Following Ambulance
        </div>
      )}
    </div>
  );
};

export default GoogleMapTracking;