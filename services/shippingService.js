// services/shippingService.js
import axios from 'axios';

class ShippingService {
  constructor() {
    this.baseURL = process.env.SHIP_ROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external';
    this.token = null;
    this.tokenExpiry = null;
  }

  async authenticate() {   
    try {
      console.log('🔐 Authenticating with ShipRocket...');
      
      if (!process.env.SHIP_ROCKET_EMAIL || !process.env.SHIP_ROCKET_PASSWORD) {
        throw new Error('ShipRocket credentials missing in environment variables');
      }

      const response = await axios.post(`${this.baseURL}/auth/login`, {
        email: process.env.SHIP_ROCKET_EMAIL,
        password: process.env.SHIP_ROCKET_PASSWORD
      }, {
        timeout: 10000
      });

      if (!response.data.token) {
        throw new Error('No token received from ShipRocket');
      }

      this.token = response.data.token;
      this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
      console.log('✅ ShipRocket authentication successful');
      return this.token;
    } catch (error) {
      console.error('❌ ShipRocket authentication failed:', error.response?.data || error.message);
      throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getHeaders() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
    
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  // 🏪 GET PICKUP LOCATIONS
  async getPickupLocations() {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(
        `${this.baseURL}/settings/company/pickup`,
        { headers, timeout: 15000 }
      );

      console.log('📦 ShipRocket Pickup Locations Response:', response.data);

      let locations = [];
      
      if (response.data && response.data.data && response.data.data.shipping_address) {
        locations = response.data.data.shipping_address;
      } else if (response.data?.shipping_address && Array.isArray(response.data.shipping_address)) {
        locations = response.data.shipping_address;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        locations = response.data.data;
      } else if (Array.isArray(response.data)) {
        locations = response.data;
      }

      if (locations.length === 0) {
        console.warn('⚠️ No pickup locations found');
        return [];
      }

      const formattedLocations = locations.map(location => ({
        id: location.id,
        pickup_location: location.pickup_location,
        address: location.address,
        address_2: location.address_2,
        city: location.city,
        state: location.state,
        country: location.country,
        pin_code: location.pin_code,
        phone: location.phone,
        name: location.name,
        email: location.email,
        is_primary_location: location.is_primary_location,
        status: location.status
      }));

      return formattedLocations;

    } catch (error) {
      console.error('❌ Failed to fetch pickup locations:', error.response?.data || error.message);
      throw new Error(`Failed to fetch pickup locations: ${error.response?.data?.message || error.message}`);
    }
  }

  // 🚀 CREATE SHIPMENT - FIXED RESPONSE HANDLING
  async createShipment(order) {
    try {
      const headers = await this.getHeaders();

      // Get pickup locations and select your primary Kanyakumari location
      const availableLocations = await this.getPickupLocations();
      
      // Use your primary Kanyakumari location (ID: 14848757)
      const selectedPickup = availableLocations.find(loc => 
        loc.id === 14848757 || loc.is_primary_location
      ) || availableLocations[0];

      if (!selectedPickup) {
        throw new Error('No pickup location found. Please configure a pickup location in ShipRocket.');
      }

      console.log('📍 Using Pickup Location:', {
        name: selectedPickup.pickup_location,
        city: selectedPickup.city,
        pincode: selectedPickup.pin_code,
        phone: selectedPickup.phone
      });

      // Get customer details
      const customerEmail = order.user?.email || order.guestUser?.email || 'customer@example.com';
      const customerName = order.user?.name || order.guestUser?.name || 'Customer';
      
      // Use shipping address phone or default
      const customerPhone = order.shippingAddress?.phone || '9876543210';

      // Prepare order items with proper HSN codes
      const orderItems = order.products.map((item, index) => {
        const hsnCode = item.hsn || item.product?.hsn || '999799';
        
        return {
          name: item.product?.name || item.name || `Product ${index + 1}`,
          sku: item.product?.sku || item.product?._id?.toString() || `SKU${index + 1}`,
          units: item.quantity || 1,
          selling_price: item.price || item.unitPrice || item.product?.price || 100,
          discount: item.discount || 0,
          tax: item.tax || 0,
          hsn: hsnCode,
          product_id: item.product?._id?.toString() || `PID${index + 1}`
        };
      });

      // Shipping address data
      const shippingAddress = order.shippingAddress || {
        fullName: "SM Travels",
        address: "123 Travel Street, Chennai, Tamil Nadu, India",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600012",
        country: "India",
        phone: "9876543489"
      };

      // 🚀 SHIPMENT DATA WITH YOUR PICKUP LOCATION
      const shipmentData = {
        // Order Details
        order_id: order.orderId.toString(),
        order_date: new Date(order.createdAt || Date.now()).toISOString().split('T')[0],
        pickup_location: selectedPickup.pickup_location, // "Home"
        channel_id: process.env.SHIPROCKET_CHANNEL_ID || '',
        comment: order.note || 'Domestic shipment from Kanyakumari to Chennai',
        
        // ✅ BILLING ADDRESS (Your Kanyakumari Pickup Location)
        billing_customer_name: selectedPickup.name || "Ajay",
        billing_last_name: '',
        billing_address: selectedPickup.address || "12 MG Road, Camp",
        billing_address_2: selectedPickup.address_2 || "railway",
        billing_city: selectedPickup.city || "Kanyakumari",
        billing_pincode: selectedPickup.pin_code || "629802",
        billing_state: selectedPickup.state || "Tamil Nadu",
        billing_country: selectedPickup.country || "India",
        billing_email: selectedPickup.email || "jinish070@gmail.com",
        billing_phone: selectedPickup.phone || "7092514027",

        // ✅ SHIPPING ADDRESS (Customer Chennai Address)  
        shipping_customer_name: shippingAddress.fullName || customerName,
        shipping_last_name: '',
        shipping_address: shippingAddress.address,
        shipping_address_2: shippingAddress.landmark || '',
        shipping_city: shippingAddress.city,
        shipping_pincode: shippingAddress.postalCode,
        shipping_state: shippingAddress.state,
        shipping_country: shippingAddress.country,
        shipping_email: customerEmail,
        shipping_phone: shippingAddress.phone,
        shipping_is_billing: false,

        // Order Items
        order_items: orderItems,
        
        // Payment Details - Always Prepaid for domestic
        payment_method: 'Prepaid',
        sub_total: order.subTotal || order.totalAmount || 0,
        length: order.packageDimensions?.length || 15,
        breadth: order.packageDimensions?.breadth || 10,
        height: order.packageDimensions?.height || 5,
        weight: order.packageWeight || 0.5
      };

      // Add additional charges if applicable
      if (order.shippingAmount > 0) {
        shipmentData.shipping_charges = order.shippingAmount;
      }

      if (order.discountAmount > 0) {
        shipmentData.total_discount = order.discountAmount;
      }

      // Calculate total if not provided
      if (!order.totalAmount) {
        shipmentData.sub_total = orderItems.reduce((total, item) => 
          total + (item.selling_price * item.units), 0
        );
      }

      console.log('🚀 Creating Shipment Details:', {
        order_id: shipmentData.order_id,
        pickup: `${shipmentData.billing_city} (${shipmentData.billing_pincode})`,
        delivery: `${shipmentData.shipping_city} (${shipmentData.shipping_pincode})`,
        items: orderItems.length,
        total: shipmentData.sub_total
      });

      const response = await axios.post(
        `${this.baseURL}/orders/create/adhoc`,
        shipmentData,
        { 
          headers,
          timeout: 30000 
        }
      );
      
      console.log('✅ ShipRocket Raw Response:', response.data);

      // ✅ FIXED: Handle the actual ShipRocket response structure
      const shiprocketData = response.data;

      if (!shiprocketData || (!shiprocketData.shipment_id && !shiprocketData.shipmentId)) {
        console.error('❌ ShipRocket missing shipment ID:', shiprocketData);
        throw new Error('ShipRocket did not return shipment_id or shipmentId');
      }

      // ✅ FIXED: Extract data from the correct structure
      const shipmentId = shiprocketData.shipment_id || shiprocketData.shipmentId;
      const orderId = shiprocketData.order_id || shiprocketData.channel_order_id;
      const awbCode = shiprocketData.awb_code || '';
      const status = shiprocketData.status || 'NEW';
      const courierName = shiprocketData.courier_name || '';

      console.log('✅ Extracted Shipment Data:', {
        shipmentId,
        orderId, 
        awbCode,
        status,
        courierName
      });

      // ✅ FIXED: Return consistent field names that controller expects
      return {
        success: true,
        shipment_id: shipmentId,        // ✅ Controller expects shipment_id
        order_id: orderId,              // ✅ Controller expects order_id  
        awb_code: awbCode,              // ✅ Controller expects awb_code
        status: status,                 // ✅ Controller expects status
        courier_name: courierName,      // ✅ Controller expects courier_name
        courier_company_id: shiprocketData.courier_company_id || '',
        label_url: shiprocketData.label_url || null,
        manifest_url: shiprocketData.manifest_url || null,
        // Also return full response for debugging
        fullResponse: shiprocketData
      };

    } catch (error) {
      console.error('❌ Shipment creation failed:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      if (error.response?.data) {
        throw new Error(`ShipRocket API Error: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to create shipment: ${error.message}`);
    }
  }

  // 🚚 CHECK SERVICEABILITY BETWEEN YOUR PICKUP AND DESTINATION
  async checkChennaiServiceability() {
    try {
      const headers = await this.getHeaders();
      
      // Check serviceability from Kanyakumari (629802) to Chennai (600012)
      const response = await axios.get(
        `${this.baseURL}/courier/serviceability`,
        {
          params: {
            pickup_postcode: "629802", // Your Kanyakumari pincode
            delivery_postcode: "600012", // Chennai pincode
            weight: 0.5,
            cod: 0 // Prepaid
          },
          headers,
          timeout: 15000
        }
      );

      console.log('📦 Serviceability Check:', response.data);
      return response.data;

    } catch (error) {
      console.error('❌ Serviceability check error:', error.response?.data || error.message);
      throw new Error(`Serviceability check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // 🚚 GET COURIER SERVICEABILITY
  async getCourierServiceability(data) {
    try {
      const headers = await this.getHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/courier/serviceability`,
        {
          params: data,
          headers,
          timeout: 15000
        }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Serviceability check error:', error.response?.data || error.message);
      throw new Error(`Serviceability check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // 📍 TRACK SHIPMENT
  async trackShipmentById(shipmentId) {
    try {
      const headers = await this.getHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/courier/track/shipment/${shipmentId}`,
        {
          headers,
          timeout: 15000
        }
      );

      console.log('📍 ShipRocket tracking response:', response.data);
      return response.data;

    } catch (error) {
      console.error('❌ Shipment tracking failed:', error.response?.data || error.message);
      throw new Error(`Shipment tracking failed: ${error.response?.data?.message || error.message}`);
    }
    
  }

  // 🚫 CANCEL SHIPMENT IN SHIPROCKET - COMPLETELY FIXED
// 🚫 CANCEL SHIPMENT IN SHIPROCKET - UPDATED FIX
// 🚫 CANCEL SHIPMENT - USE ORDER_ID NOT SHIPMENT_ID
async cancelShipment(shipmentData) {
  try {
    const headers = await this.getHeaders();
    
    console.log('🚫 Cancelling in Shiprocket:', shipmentData);

    // ✅ FIX: Use order_id from Shiprocket response, not shipment_id
    const shiprocketOrderId = shipmentData.shipRocketResponse?.order_id || 
                              shipmentData.order_id;
    
    if (!shiprocketOrderId) {
      throw new Error('No Shiprocket order_id found in shipment data');
    }

    console.log('📦 Using Shiprocket order_id for cancellation:', shiprocketOrderId);

    const cancellationPayload = {
      ids: [parseInt(shiprocketOrderId)]
    };

    console.log('🔄 Sending cancellation payload:', cancellationPayload);

    const response = await axios.post(
      `${this.baseURL}/orders/cancel`,
      cancellationPayload,
      { headers, timeout: 15000 }
    );

    console.log('✅ Shiprocket cancellation response:', response.data);

    if (response.data && (response.data.status === 200 || response.data.status_code === 200)) {
      return {
        success: true,
        message: 'Shipment cancelled successfully in Shiprocket',
        data: response.data
      };
    } else {
      throw new Error(`Shiprocket cancellation failed: ${response.data.message || JSON.stringify(response.data)}`);
    }

  } catch (error) {
    console.error('❌ Shiprocket cancellation failed:', error.response?.data || error.message);
    
    if (error.response?.data) {
      const errorMsg = error.response.data.message || JSON.stringify(error.response.data);
      
      if (errorMsg.includes('already cancelled') || errorMsg.includes('does not exist')) {
        return {
          success: true,
          message: 'Shipment was already cancelled in Shiprocket',
          alreadyCancelled: true
        };
      }
      
      throw new Error(`Shiprocket API Error: ${errorMsg}`);
    }
    
    throw new Error(`Failed to cancel Shiprocket shipment: ${error.message}`);
  }
}
}

export default new ShippingService();