import React, {useEffect, useState} from 'react';
import {
  Alert,
  DeviceEventEmitter,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {RNSerialport, actions, definitions} from 'react-native-usb-serialport';
import Geolocation, {
  GeolocationResponse,
} from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

function asciiToHex(input: string) {
  const output: string[] = [];

  for (let n = 0, l = input.length; n < l; n++) {
    const hex = Number(input.charCodeAt(n)).toString(16);
    output.push(hex);
  }

  return output.join('');
}

function App(): JSX.Element {
  const {location, networkConnected, rssi, socketConnected, serialData} =
    useUSBSerial();

  return (
    <SafeAreaView>
      <View style={{padding: 40}}>
        <ScrollView
          style={{
            borderColor: 'white',
            borderWidth: 1,
            height: 500,
            gap: 10,
            marginBottom: 10,
            padding: 5,
          }}>
          {serialData.map((item, i) => {
            return (
              <Text key={i} style={{flex: 1}}>
                {item}
              </Text>
            );
          })}
        </ScrollView>
        <View style={{gap: 10}}>
          <Text>{`Postition: ${location?.coords.longitude}, ${location?.coords.latitude}`}</Text>
          <View style={{flexDirection: 'row', gap: 10}}>
            <Icon
              name={socketConnected ? 'power-plug' : 'power-plug-off'}
              size={30}
            />
            <Icon
              name={networkConnected ? 'cloud-outline' : 'cloud-off-outline'}
              size={30}
            />
            <Text>{`RSSI: ${rssi}`}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

let buffer = '';

function useUSBSerial() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [networkConnected, setNetworkConnected] = useState(false);
  const [rssi, setRSSI] = useState(0);

  const [deviceName, setDeviceName] = useState<string | null>();
  const [serialData, setSerialData] = useState<string[]>([]);

  const [location, setLocation] = useState<GeolocationResponse | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (socketConnected) {
        RNSerialport.writeString(deviceName, 'AT+RSSI=?\n');
        RNSerialport.writeString(deviceName, 'AT+NJS=?\n');

        Geolocation.getCurrentPosition(info => {
          setLocation(info);

          const payload = `01,${info.coords.longitude},${info.coords.latitude},${info.coords.altitude}`;

          const hexPayload = asciiToHex(payload);
          const len = hexPayload.length / 2;
          RNSerialport.writeString(
            deviceName,
            `AT+SENDB=0,2,${len},${hexPayload}\n`,
          );
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [deviceName, socketConnected]);

  useEffect(() => {
    DeviceEventEmitter.addListener(actions.ON_DEVICE_ATTACHED, deviceName => {
      console.log('Device attached', deviceName);
    });

    DeviceEventEmitter.addListener(actions.ON_DEVICE_DETACHED, () => {
      console.log('Device detached');
    });

    DeviceEventEmitter.addListener(actions.ON_ERROR, e => {
      console.log(e);
      Alert.alert('Error!', e.toString());
    });

    DeviceEventEmitter.addListener(actions.ON_CONNECTED, deviceName => {
      setDeviceName(deviceName);
      setSocketConnected(true);
    });

    DeviceEventEmitter.addListener(actions.ON_DISCONNECTED, () => {
      setSocketConnected(false);
      Alert.alert('Disconnected!');
    });

    function setBuffer() {
      const strippedBuffer = buffer.replace(/\s/g, '');

      if (strippedBuffer === '1') {
        setNetworkConnected(true);
      }

      if (strippedBuffer === '0') {
        setNetworkConnected(false);
      }

      if (strippedBuffer.startsWith('Rssi')) {
        const parts = buffer.split(' ');
        const valueParts = parts[1].split('\r');

        setRSSI(parseInt(valueParts[0]));

        console.log('vPARTS', JSON.stringify(valueParts));

        if (valueParts[1] && valueParts[1] === 'JOINED') {
          setNetworkConnected(true);
        }
      }

      setSerialData(existingSerialData => [
        ...existingSerialData.slice(-50),
        buffer,
      ]);
      buffer = '';
    }

    DeviceEventEmitter.addListener(actions.ON_READ_DATA, data => {
      for (let i = 0; i < data.payload.length; i += 2) {
        const charCode = parseInt(data.payload.slice(i, i + 2), 16);

        if (charCode === 0x0a) {
          return setBuffer();
        }

        buffer += String.fromCharCode(charCode);
      }
    });
  }, []);

  RNSerialport.setReturnedDataType(definitions.RETURNED_DATA_TYPES.HEXSTRING);
  RNSerialport.setAutoConnect(true);
  RNSerialport.setAutoConnectBaudRate(9600);
  RNSerialport.startUsbService();

  return {
    deviceName,
    location,
    networkConnected,
    rssi,
    socketConnected,
    serialData,
  };
}

export default App;
