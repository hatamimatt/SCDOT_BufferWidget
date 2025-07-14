/** @jsx jsx */
import React, { useState, useEffect, useRef } from 'react';
import { jsx } from 'jimu-core';
import { AllWidgetProps } from 'jimu-core';
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis';
import { Radio, Button, Select, Option, TextInput, Checkbox } from 'jimu-ui';
import GraphicsLayer from 'esri/layers/GraphicsLayer';
import SketchViewModel from 'esri/widgets/Sketch/SketchViewModel';
import SimpleMarkerSymbol from 'esri/symbols/SimpleMarkerSymbol';
import SimpleLineSymbol from 'esri/symbols/SimpleLineSymbol';
import SimpleFillSymbol from 'esri/symbols/SimpleFillSymbol';
import Graphic from 'esri/Graphic';
import geometryEngine from 'esri/geometry/geometryEngine';
// RE-ADDED: QueryTask and Query imports
import QueryTask from 'esri/tasks/QueryTask';
import Query from 'esri/rest/support/Query';

const Widget = (props: AllWidgetProps<unknown>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>(null);
  const [sketchViewModel, setSketchViewModel] = useState<SketchViewModel>(null);
  const [graphicsLayer, setGraphicsLayer] = useState<GraphicsLayer>(null);
  const [geometryType, setGeometryType] = useState<'point' | 'polyline' | 'polygon'>('point');
  const [bufferDistance, setBufferDistance] = useState(100);
  const [bufferUnit, setBufferUnit] = useState<'meters' | 'kilometers' | 'feet' | 'miles'>('meters');
  const [bufferGraphic, setBufferGraphic] = useState<Graphic>(null); 

  // State for managing available and selected layers
  const [availableLayers, setAvailableLayers] = useState<Array<{ id: string; title: string; url: string }>>([]);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [showLayerSelection, setShowLayerSelection] = useState<boolean>(false); 
  // NEW: State to store query-related error messages for UI display
  const [queryError, setQueryError] = useState<string | null>(null);

  // Use refs to store the latest bufferDistance and bufferUnit
  const bufferDistanceRef = useRef(bufferDistance);
  const bufferUnitRef = useRef(bufferUnit);

  useEffect(() => {
    bufferDistanceRef.current = bufferDistance;
  }, [bufferDistance]);

  useEffect(() => {
    bufferUnitRef.current = bufferUnit;
  }, [bufferUnit]);


  useEffect(() => {
    if (jimuMapView && jimuMapView.view) {
      const layer = new GraphicsLayer();
      jimuMapView.view.map.add(layer);
      setGraphicsLayer(layer);

      const sketchVM = new SketchViewModel({
        view: jimuMapView.view,
        layer,
        pointSymbol: new SimpleMarkerSymbol({ style: 'circle', color: [226, 119, 40], size: '12px' }),
        polylineSymbol: new SimpleLineSymbol({ color: [226, 119, 40], width: 2 }),
        polygonSymbol: new SimpleFillSymbol({
          color: [226, 119, 40, 0.4],
          outline: new SimpleLineSymbol({ color: [226, 119, 40], width: 1 }),
        }),
      });

      sketchVM.on('create', (event) => {
        if (event.state === 'complete') {
          const currentBufferDistance = bufferDistanceRef.current;
          const currentBufferUnit = bufferUnitRef.current;

          const buffer = geometryEngine.buffer(event.graphic.geometry, currentBufferDistance, currentBufferUnit);
          if (buffer) {
            const newBufferGraphic = new Graphic({ 
              geometry: buffer,
              symbol: new SimpleFillSymbol({
                color: [0, 0, 255, 0.2],
                outline: new SimpleLineSymbol({ color: [0, 0, 255], width: 1 }),
              }),
            });
            layer.add(newBufferGraphic); 
            setBufferGraphic(newBufferGraphic); 
            layer.remove(event.graphic); 
          }
          jimuMapView.view.cursor = 'default';
        }
      });

      setSketchViewModel(sketchVM);

      // Populate available layers when jimuMapView is ready
      const layers = jimuMapView.view.map.allLayers.toArray()
        .filter(layer => layer.type === 'feature' && layer.url) // Only consider feature layers with a URL for querying
        .map(layer => ({
          id: layer.id,
          title: layer.title || layer.id, // Use title if available, otherwise ID
          url: layer.url
        }));
      setAvailableLayers(layers);
      console.log('Available Feature Layers:', layers); 
      setSelectedLayerIds(layers.map(layer => layer.id));


      // Cleanup function
      return () => {
        if (sketchVM) {
          sketchVM.destroy();
        }
        if (layer) {
          jimuMapView.view.map.remove(layer);
        }
      };
    }
  }, [jimuMapView]); 

  const handleDrawClick = () => {
    if (sketchViewModel) {
      if (graphicsLayer && bufferGraphic) {
        graphicsLayer.remove(bufferGraphic);
        setBufferGraphic(null);
      }
      setQueryError(null); // Clear any previous error when starting a new draw
      sketchViewModel.create(geometryType);
      jimuMapView.view.cursor = 'crosshair';
    }
  };

  const handleClear = () => {
    if (graphicsLayer) {
      graphicsLayer.removeAll();
      setBufferGraphic(null); 
    }
    setQueryError(null); // Clear any error when clearing all
  };

  const handleToggleLayerSelection = () => {
    setShowLayerSelection(!showLayerSelection);
  };

  const handleLayerCheckboxChange = (layerId: string) => {
    setSelectedLayerIds(prevSelected => {
      if (prevSelected.includes(layerId)) {
        return prevSelected.filter(id => id !== layerId); // Deselect
      } else {
        return [...prevSelected, layerId]; // Select
      }
    });
  };

  // RE-IMPLEMENTED: handleExportReport now performs spatial intersection using selected layers
  const handleExportReport = async () => { // Made async again
    setQueryError(null); // Clear previous errors before a new attempt

    if (!jimuMapView || !jimuMapView.view || !bufferGraphic) {
      setQueryError('Please draw a buffer first to perform intersection.');
      console.log('Please draw a buffer first to perform intersection.');
      return;
    }

    if (selectedLayerIds.length === 0) {
      setQueryError('Please select at least one layer to intersect with.');
      console.log('Please select at least one layer to intersect with.');
      return;
    }

    const bufferGeometry = bufferGraphic.geometry;
    const intersectionResults: any[] = []; 

    console.log('Starting intersection query...');
    console.log('Attempting to query selected layers:', selectedLayerIds);

    // Filter layers based on user selection from availableLayers
    const layersToQuery = availableLayers.filter(layer => 
      selectedLayerIds.includes(layer.id)
    );

    for (const layerInfo of layersToQuery) { 
      console.log(`Querying layer: ${layerInfo.title} (${layerInfo.url})`);
      try {
        // QueryTask and Query should be available from top-level imports
        const queryTask = new QueryTask({ url: layerInfo.url }); 
        const query = new Query(); 
        query.geometry = bufferGeometry; 
        query.spatialRelationship = 'intersects'; 
        query.returnGeometry = false; 
        query.outFields = ['*']; 

        const results = await queryTask.execute(query); 
        if (results.features.length > 0) {
          intersectionResults.push({
            layerName: layerInfo.title, 
            features: results.features.map(f => ({
              attributes: f.attributes, 
            })),
          });
          console.log(`Found ${results.features.length} intersecting features in layer: ${layerInfo.title}`);
        } else {
          console.log(`No intersecting features found in layer: ${layerInfo.title}`);
        }
      } catch (error) {
        console.error(`Error querying layer ${layerInfo.title}:`, error);
        // Display a user-friendly error message in the UI
        setQueryError(`Failed to query "${layerInfo.title}". Check console for details (CORS/API module issue).`);
        // Do not return, continue processing other layers
      }
    }

    console.log('Intersection query complete. Results:', intersectionResults);
    if (intersectionResults.length === 0 && !queryError) {
      setQueryError('No intersecting features found in any selected layer.');
    } else if (intersectionResults.length > 0 && !queryError) {
      // If successful, you would proceed to PDF generation here
      console.log('Proceeding to PDF generation (next step)...');
      // For now, just clear error if successful and display a success message
      setQueryError('Intersection complete. Check console for results. PDF generation is the next step.');
    }
  };

  return (
    <div
      className="widget-container"
      style={{
        padding: '1rem',
        borderRadius: '10px',
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        width: '300px',
      }}
    >
      {!jimuMapView && <div>Please connect this widget to a map using the setting panel.</div>}

      {jimuMapView && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Select Geometry Type:</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <label>
                <Radio name="geometry" checked={geometryType === 'point'} onChange={() => setGeometryType('point')} />
                Point
              </label>
              <label>
                <Radio name="geometry" checked={geometryType === 'polyline'} onChange={() => setGeometryType('polyline')} />
                Polyline
              </label>
              <label>
                <Radio name="geometry" checked={geometryType === 'polygon'} onChange={() => setGeometryType('polygon')} />
                Polygon
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <strong>Buffer Distance:</strong>
            <TextInput
              type="number"
              value={bufferDistance.toString()}
              onChange={(e) => setBufferDistance(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <strong>Buffer Unit:</strong>
            <Select value={bufferUnit} onChange={(e) => setBufferUnit(e.target.value as any)} style={{ width: '100%' }}>
              <Option value="meters">Meters</Option>
              <Option value="kilometers">Kilometers</Option>
              <Option value="feet">Feet</Option>
              <Option value="miles">Miles</Option>
            </Select>
          </div>

          <Button type="primary" onClick={handleDrawClick} style={{ width: '100%', marginBottom: '0.5rem' }}>
            Start Drawing
          </Button>

          <Button onClick={handleToggleLayerSelection} style={{ width: '100%', marginBottom: '0.5rem' }}>
            {showLayerSelection ? 'Hide Layer Selection' : 'Select Layers for Report'}
          </Button>

          {showLayerSelection && (
            <div style={{ 
              border: '1px solid #ccc', 
              borderRadius: '5px', 
              padding: '0.5rem', 
              marginBottom: '1rem',
              maxHeight: '150px', 
              overflowY: 'auto', 
              backgroundColor: 'rgba(255, 255, 255, 0.8)'
            }}>
              <strong>Select Layers:</strong>
              {availableLayers.length > 0 ? (
                availableLayers.map(layer => (
                  <div key={layer.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <Checkbox
                      checked={selectedLayerIds.includes(layer.id)}
                      onChange={() => handleLayerCheckboxChange(layer.id)}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <span>{layer.title}</span>
                  </div>
                ))
              ) : (
                <p>No queryable layers found in the map.</p>
              )}
            </div>
          )}

          {/* NEW: Display query error message */}
          {queryError && (
            <div style={{ color: 'red', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid red', borderRadius: '5px' }}>
              {queryError}
            </div>
          )}

          <Button onClick={handleExportReport} style={{ width: '100%', marginBottom: '0.5rem' }}> 
            Export Report
          </Button>
          <Button type="danger" onClick={handleClear} style={{ width: '100%' }}>
            Clear All
          </Button>
        </>
      )}

      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds?.[0]}
        onActiveViewChange={(view) => {
          if (view) setJimuMapView(view);
        }}
      />
    </div>
  );
};

export default Widget;
