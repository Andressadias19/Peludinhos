document.addEventListener("DOMContentLoaded", function () {

    const centerLat = -2.4430;
    const centerLng = -54.7083;

    const map = L.map("map", {
        zoomControl: false,
        attributionControl: false // disabled to match design
    }).setView([centerLat, centerLng], 14);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19
        }
    ).addTo(map);

    // Custom Paw Marker with white background using peludinhos.svg
    const pawIcon = L.divIcon({
        html: '<div style="background-color: white; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.2); border: 2px solid #1B898B;"><img src="../assets/icons/peludinhos.svg" style="width: 28px; height: auto;"></div>',
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22]
    });

    const sightings = [
        { lat: -2.4400, lng: -54.7100, name: "Rex", type: "Cachorro", time: "Visto há 1h", img: "../assets/images/rex.jpg" },
        { lat: -2.4450, lng: -54.7050, name: "Mel", type: "Cachorro", time: "Visto há 3h", img: "../assets/images/mel.jpg" },
        { lat: -2.4420, lng: -54.7150, name: "Nina", type: "Gato", time: "Visto há 5h", img: "../assets/images/nina.jpg" }
    ];

    sightings.forEach(sighting => {
        const marker = L.marker([sighting.lat, sighting.lng], {icon: pawIcon}).addTo(map);
        
        const popupContent = `
            <div style="text-align: center; min-width: 120px; font-family: 'Plus Jakarta Sans', sans-serif;">
                <img src="${sighting.img}" alt="${sighting.name}" onerror="this.src='https://images.unsplash.com/photo-1543466835-00a7907e9de1?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80'" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin: 0 auto 8px auto; display: block;">
                <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #1f2937;">${sighting.name}</h3>
                <p style="margin: 4px 0 8px 0; font-size: 12px; color: #6b7280;">${sighting.time}</p>
                <a href="detalhes_animal.html" style="display: block; background-color: #1a8d8d; color: white; text-decoration: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: bold;">Ver Detalhes</a>
            </div>
        `;

        marker.bindPopup(popupContent, {
            offset: [0, -10],
            closeButton: false,
            className: 'custom-popup'
        });

        marker.on('click', function(e) {
            // Zoom in slightly when clicked
            map.flyTo(e.latlng, 17, {
                animate: true,
                duration: 0.5
            });
        });
    });
});