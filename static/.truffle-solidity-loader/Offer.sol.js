var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("Offer error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("Offer error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("Offer contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of Offer: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to Offer.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: Offer not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "*": {
    "abi": [
      {
        "constant": false,
        "inputs": [],
        "name": "bid",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "s",
            "type": "string"
          }
        ],
        "name": "stringToUint",
        "outputs": [
          {
            "name": "result",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "Coverage",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "myid",
            "type": "bytes32"
          },
          {
            "name": "result",
            "type": "string"
          }
        ],
        "name": "__callback",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "myid",
            "type": "bytes32"
          },
          {
            "name": "result",
            "type": "string"
          },
          {
            "name": "proof",
            "type": "bytes"
          }
        ],
        "name": "__callback",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "CloseDate",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "Odds",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "RemainingCoverage",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "update",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "LockDate",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_odds",
            "type": "uint256"
          },
          {
            "name": "_coverage",
            "type": "uint256"
          },
          {
            "name": "_offerAddr",
            "type": "address"
          },
          {
            "name": "_offerHash",
            "type": "string"
          },
          {
            "name": "_houseAddr",
            "type": "address"
          },
          {
            "name": "_houseRatio",
            "type": "uint8"
          }
        ],
        "payable": true,
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "description",
            "type": "string"
          }
        ],
        "name": "newOraclizeQuery",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [],
        "name": "initialized",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "bidWin",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "bidder",
            "type": "address"
          }
        ],
        "name": "newBid",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "sellWin",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260405161151d38038061151d83398101604090815281516020830151918301516060840151608085015160a0860151939592939190920191905b60068590556007859055600a8054600160a060020a031916600160a060020a0386161790558251600c8054600082905290917fdf6966c971051c3d54ec59162606531493a51404a002842f56009d7e5cf4a8c7602060026101006001861615026000190190941693909304601f9081018490048201938801908390106100cf57805160ff19168380011785556100fc565b828001600101855582156100fc579182015b828111156100fc5782518255916020019190600101906100e1565b5b5061011d9291505b808211156101195760008155600101610105565b5090565b5050600b8054600160a060020a031916600160a060020a03841617905560ff8116600d556040517f158ef93e651b754acb66eb57a90cae1cb99d4bf585ce27c60e583652991b0ad190600090a15b5050505050505b61139c806101816000396000f300606060405236156100885763ffffffff60e060020a6000350416631998aeef811461008d5780631bd95155146100975780632419ef4d146100fc57806327dc297e1461011b57806338bbfa501461017157806357f44252146102045780635ed0865d1461022357806378cbf1b614610242578063a2e6204514610261578063cfd70ecc1461026b575b610000565b61009561028a565b005b34610000576100ea600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375094965061034b95505050505050565b60408051918252519081900360200190f35b34610000576100ea6103bf565b60408051918252519081900360200190f35b346100005760408051602060046024803582810135601f810185900485028601850190965285855261009595833595939460449493929092019181908401838280828437509496506103c595505050505050565b005b346100005760408051602060046024803582810135601f8101859004850286018501909652858552610095958335959394604494939290920191819084018382808284375050604080516020601f89358b0180359182018390048302840183019094528083529799988101979196509182019450925082915084018382808284375094965061063195505050505050565b005b34610000576100ea610637565b60408051918252519081900360200190f35b34610000576100ea61063d565b60408051918252519081900360200190f35b34610000576100ea610643565b60408051918252519081900360200190f35b610095610649565b005b34610000576100ea61084b565b60408051918252519081900360200190f35b60006008546000141580156102a0575060085442115b156102aa57610000565b6007543411156102b957610000565b5033600160a060020a0381166000818152600e60209081526040808320805434908101909155601080548552600f8452938290208054600160a060020a03191686179055835460010190935560078054849003905580519283529082019290925281517fb7d1f8cff4df65fbeb952c3bcd123546ce38217d1ad4a64ca4097c981d5dd012929181900390910190a15b50565b60408051602081019091526000908190528181805b82518210156103b6578282815181101561000057016020015160f860020a90819004810204905060308110801590610399575060398111155b156103aa576030810384600a020193505b5b600190910190610360565b5b505050919050565b60065481565b6000600060006000600060006000600060006000600060006103e5610851565b600160a060020a031633600160a060020a031614151561040457610000565b60009b506104118d61034b565b9a508a151561041f5761061e565b8a6001141561053e5742600855600099508998505b601054891015610506576000898152600f6020908152604080832054600160a060020a0316808452600e90925290912054600554600d54929a50909850606491820390890202049550856005548802039b5087600160a060020a03166108fc879081150290604051809050600060405180830381858888f1935050505094508415156104bf57610000565b600b54604051600160a060020a03909116908d156108fc02908e906000818181858888f1935050505093508315156104f657610000565b988b01985b600190980197610434565b604080518d815290517fc80db4d7a51a16db8f9d461371b8278937466bb0d34183db5036f7a0f874ead59181900360200190a161061e565b8a600214156100885742600855600754600654600d54600a54604051606494909303918403820293909304908190039e509450600160a060020a03909116906108fc8515029085906000818181858888f1935050505091508115156105a257610000565b600b54604051600160a060020a03909116908d156108fc02908e906000818181858888f1935050505090508015156105d957610000565b60408051848152602081018e905281517fdca5b55a966a58c6afc26f63a5134da983b67a02830f0c0ccd19c1d422179082929181900390910190a161061e565b610000565b5b5b5b5050505050505050505050505050565b5b505050565b60085481565b60055481565b60075481565b6040805160208181018352600082528251818152602c918101919091527f4469737061746368696e6720717565727920746f206265747961687120766961818401527f206f7261636c697a652e2e2e00000000000000000000000000000000000000006060820152915190917f46cb989ef9cef13e930e3b7f286225a086e716a90d63e0b7da85d310a9db0c9a919081900360800190a15060408051606081018252603481527f6a736f6e2868747470733a2f2f62657479612e6865726f6b756170702e636f6d6020808301919091527f2f6170692f77696e3f6f666665725f686173683d0000000000000000000000008284015282518084018452600381527f55524c000000000000000000000000000000000000000000000000000000000081830152600c8054855160026001831615610100026000190190921691909104601f8101859004850282018501909652858152939461084694610e109461084193889390918301828280156108005780601f106107d557610100808354040283529160200191610800565b820191906000526020600020905b8154815290600101906020018083116107e357829003601f168201915b5050505050604060405190810160405280600581526020017f292e77696e000000000000000000000000000000000000000000000000000000815250610981565b6109c9565b505b50565b60095481565b60008054600160a060020a0316158061087c575060005461087a90600160a060020a0316610cf8565b155b1561088d5761088b6000610d00565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a0392831617908190556000602093840181905284517fc281d19e000000000000000000000000000000000000000000000000000000008152945191909216945063c281d19e9360048082019493918390030190829087803b156100005760325a03f115610000575050604051519150505b5b90565b60206040519081016040528060008152506109bf84848460206040519081016040528060008152506020604051908101604052806000815250611044565b90505b9392505050565b600080548190600160a060020a031615806109f657506000546109f490600160a060020a0316610cf8565b155b15610a0757610a056000610d00565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a039283161790819055600060209384015292517f524f38890000000000000000000000000000000000000000000000000000000081526004810183815289516024830152895194909216945063524f3889938993839260440191908501908083838215610b0e575b805182526020831115610b0e57601f199092019160209182019101610aee565b505050905090810190601f168015610b3a5780820380516001836020036101000a031916815260200191505b5092505050602060405180830381600087803b156100005760325a03f11561000057505060405151915050670de0b6b3a764000062030d403a0201811115610b855760009150610cef565b60015460408051600060209182015290517fadf59f9900000000000000000000000000000000000000000000000000000000815260048101888152606060248301908152885160648401528851600160a060020a039095169463adf59f999487948c948c948c949193909260448101926084909101918701908083838215610c28575b805182526020831115610c2857601f199092019160209182019101610c08565b505050905090810190601f168015610c545780820380516001836020036101000a031916815260200191505b5083810382528451815284516020918201918601908083838215610c93575b805182526020831115610c9357601f199092019160209182019101610c73565b505050905090810190601f168015610cbf5780820380516001836020036101000a031916815260200191505b50955050505050506020604051808303818588803b156100005761235a5a03f11561000057505060405151935050505b5b509392505050565b803b5b919050565b60006000610d21731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed610cf8565b1115610d925760008054600160a060020a031916731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed17905560408051808201909152600b81527f6574685f6d61696e6e65740000000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610db173c03a2615d5efaf5f49f60b7bb6583eaec212fdf1610cf8565b1115610e225760008054600160a060020a03191673c03a2615d5efaf5f49f60b7bb6583eaec212fdf117905560408051808201909152600c81527f6574685f726f707374656e3300000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610e4173b7a07bcf2ba2f2703b24c0691b5278999c59ac7e610cf8565b1115610eb25760008054600160a060020a03191673b7a07bcf2ba2f2703b24c0691b5278999c59ac7e17905560408051808201909152600981527f6574685f6b6f76616e00000000000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610ed173146500cfd35b22e4a392fe0adc06de1a1368ed48610cf8565b1115610f425760008054600160a060020a03191673146500cfd35b22e4a392fe0adc06de1a1368ed4817905560408051808201909152600b81527f6574685f72696e6b6562790000000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610f61736f485c8bf6fc43ea212e93bbf8ce046c7f1cb475610cf8565b1115610f95575060008054600160a060020a031916736f485c8bf6fc43ea212e93bbf8ce046c7f1cb4751790556001610cfb565b6000610fb47320e12a1f859b3feae5fb2a0a32c18f5a65555bbf610cf8565b1115610fe8575060008054600160a060020a0319167320e12a1f859b3feae5fb2a0a32c18f5a65555bbf1790556001610cfb565b60006110077351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa610cf8565b111561103b575060008054600160a060020a0319167351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa1790556001610cfb565b5060005b919050565b60408051602081810183526000808352835180830185528190528351808301855281905283518083018552819052835180830185528190528351808301855281905283518083018552818152845192830185528183528551875189518b518d51985197988e988e988e988e988e9890979296919586950190910190910101908059106110cd5750595b908082528060200260200182016040525b50935083925060009150600090505b885181101561114657888181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b6001016110ed565b5060005b87518110156111a357878181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b60010161114a565b5060005b865181101561120057868181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b6001016111a7565b5060005b855181101561125d57858181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b600101611204565b5060005b84518110156112ba57848181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b600101611261565b8299505b50505050505050505095945050505050565b8060029080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061131c57805160ff1916838001178555611349565b82800160010185558215611349579182015b8281111561134957825182559160200191906001019061132e565b5b506106319291505b808211156113665760008155600101611352565b5090565b50505b505600a165627a7a72305820dfdaa3b0d45ff0ceff2338169276492a5aed04855f41dbc4ab69d4973da986140029",
    "events": {
      "0x46cb989ef9cef13e930e3b7f286225a086e716a90d63e0b7da85d310a9db0c9a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "description",
            "type": "string"
          }
        ],
        "name": "newOraclizeQuery",
        "type": "event"
      },
      "0x158ef93e651b754acb66eb57a90cae1cb99d4bf585ce27c60e583652991b0ad1": {
        "anonymous": false,
        "inputs": [],
        "name": "initialized",
        "type": "event"
      },
      "0xc80db4d7a51a16db8f9d461371b8278937466bb0d34183db5036f7a0f874ead5": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "bidWin",
        "type": "event"
      },
      "0xb7d1f8cff4df65fbeb952c3bcd123546ce38217d1ad4a64ca4097c981d5dd012": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "bidder",
            "type": "address"
          }
        ],
        "name": "newBid",
        "type": "event"
      },
      "0xdca5b55a966a58c6afc26f63a5134da983b67a02830f0c0ccd19c1d422179082": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "sellWin",
        "type": "event"
      }
    },
    "updated_at": 1496855358509
  },
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [],
        "name": "bid",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "s",
            "type": "string"
          }
        ],
        "name": "stringToUint",
        "outputs": [
          {
            "name": "result",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "Coverage",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "myid",
            "type": "bytes32"
          },
          {
            "name": "result",
            "type": "string"
          }
        ],
        "name": "__callback",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "myid",
            "type": "bytes32"
          },
          {
            "name": "result",
            "type": "string"
          },
          {
            "name": "proof",
            "type": "bytes"
          }
        ],
        "name": "__callback",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "CloseDate",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "Odds",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "RemainingCoverage",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "update",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "LockDate",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_odds",
            "type": "uint256"
          },
          {
            "name": "_coverage",
            "type": "uint256"
          },
          {
            "name": "_offerAddr",
            "type": "address"
          },
          {
            "name": "_offerHash",
            "type": "string"
          },
          {
            "name": "_houseAddr",
            "type": "address"
          },
          {
            "name": "_houseRatio",
            "type": "uint8"
          }
        ],
        "payable": true,
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "description",
            "type": "string"
          }
        ],
        "name": "newOraclizeQuery",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [],
        "name": "initialized",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "bidWin",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "bidder",
            "type": "address"
          }
        ],
        "name": "newBid",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "sellWin",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260405161151d38038061151d83398101604090815281516020830151918301516060840151608085015160a0860151939592939190920191905b60068590556007859055600a8054600160a060020a031916600160a060020a0386161790558251600c8054600082905290917fdf6966c971051c3d54ec59162606531493a51404a002842f56009d7e5cf4a8c7602060026101006001861615026000190190941693909304601f9081018490048201938801908390106100cf57805160ff19168380011785556100fc565b828001600101855582156100fc579182015b828111156100fc5782518255916020019190600101906100e1565b5b5061011d9291505b808211156101195760008155600101610105565b5090565b5050600b8054600160a060020a031916600160a060020a03841617905560ff8116600d556040517f158ef93e651b754acb66eb57a90cae1cb99d4bf585ce27c60e583652991b0ad190600090a15b5050505050505b61139c806101816000396000f300606060405236156100885763ffffffff60e060020a6000350416631998aeef811461008d5780631bd95155146100975780632419ef4d146100fc57806327dc297e1461011b57806338bbfa501461017157806357f44252146102045780635ed0865d1461022357806378cbf1b614610242578063a2e6204514610261578063cfd70ecc1461026b575b610000565b61009561028a565b005b34610000576100ea600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375094965061034b95505050505050565b60408051918252519081900360200190f35b34610000576100ea6103bf565b60408051918252519081900360200190f35b346100005760408051602060046024803582810135601f810185900485028601850190965285855261009595833595939460449493929092019181908401838280828437509496506103c595505050505050565b005b346100005760408051602060046024803582810135601f8101859004850286018501909652858552610095958335959394604494939290920191819084018382808284375050604080516020601f89358b0180359182018390048302840183019094528083529799988101979196509182019450925082915084018382808284375094965061063195505050505050565b005b34610000576100ea610637565b60408051918252519081900360200190f35b34610000576100ea61063d565b60408051918252519081900360200190f35b34610000576100ea610643565b60408051918252519081900360200190f35b610095610649565b005b34610000576100ea61084b565b60408051918252519081900360200190f35b60006008546000141580156102a0575060085442115b156102aa57610000565b6007543411156102b957610000565b5033600160a060020a0381166000818152600e60209081526040808320805434908101909155601080548552600f8452938290208054600160a060020a03191686179055835460010190935560078054849003905580519283529082019290925281517fb7d1f8cff4df65fbeb952c3bcd123546ce38217d1ad4a64ca4097c981d5dd012929181900390910190a15b50565b60408051602081019091526000908190528181805b82518210156103b6578282815181101561000057016020015160f860020a90819004810204905060308110801590610399575060398111155b156103aa576030810384600a020193505b5b600190910190610360565b5b505050919050565b60065481565b6000600060006000600060006000600060006000600060006103e5610851565b600160a060020a031633600160a060020a031614151561040457610000565b60009b506104118d61034b565b9a508a151561041f5761061e565b8a6001141561053e5742600855600099508998505b601054891015610506576000898152600f6020908152604080832054600160a060020a0316808452600e90925290912054600554600d54929a50909850606491820390890202049550856005548802039b5087600160a060020a03166108fc879081150290604051809050600060405180830381858888f1935050505094508415156104bf57610000565b600b54604051600160a060020a03909116908d156108fc02908e906000818181858888f1935050505093508315156104f657610000565b988b01985b600190980197610434565b604080518d815290517fc80db4d7a51a16db8f9d461371b8278937466bb0d34183db5036f7a0f874ead59181900360200190a161061e565b8a600214156100885742600855600754600654600d54600a54604051606494909303918403820293909304908190039e509450600160a060020a03909116906108fc8515029085906000818181858888f1935050505091508115156105a257610000565b600b54604051600160a060020a03909116908d156108fc02908e906000818181858888f1935050505090508015156105d957610000565b60408051848152602081018e905281517fdca5b55a966a58c6afc26f63a5134da983b67a02830f0c0ccd19c1d422179082929181900390910190a161061e565b610000565b5b5b5b5050505050505050505050505050565b5b505050565b60085481565b60055481565b60075481565b6040805160208181018352600082528251818152602c918101919091527f4469737061746368696e6720717565727920746f206265747961687120766961818401527f206f7261636c697a652e2e2e00000000000000000000000000000000000000006060820152915190917f46cb989ef9cef13e930e3b7f286225a086e716a90d63e0b7da85d310a9db0c9a919081900360800190a15060408051606081018252603481527f6a736f6e2868747470733a2f2f62657479612e6865726f6b756170702e636f6d6020808301919091527f2f6170692f77696e3f6f666665725f686173683d0000000000000000000000008284015282518084018452600381527f55524c000000000000000000000000000000000000000000000000000000000081830152600c8054855160026001831615610100026000190190921691909104601f8101859004850282018501909652858152939461084694610e109461084193889390918301828280156108005780601f106107d557610100808354040283529160200191610800565b820191906000526020600020905b8154815290600101906020018083116107e357829003601f168201915b5050505050604060405190810160405280600581526020017f292e77696e000000000000000000000000000000000000000000000000000000815250610981565b6109c9565b505b50565b60095481565b60008054600160a060020a0316158061087c575060005461087a90600160a060020a0316610cf8565b155b1561088d5761088b6000610d00565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a0392831617908190556000602093840181905284517fc281d19e000000000000000000000000000000000000000000000000000000008152945191909216945063c281d19e9360048082019493918390030190829087803b156100005760325a03f115610000575050604051519150505b5b90565b60206040519081016040528060008152506109bf84848460206040519081016040528060008152506020604051908101604052806000815250611044565b90505b9392505050565b600080548190600160a060020a031615806109f657506000546109f490600160a060020a0316610cf8565b155b15610a0757610a056000610d00565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a039283161790819055600060209384015292517f524f38890000000000000000000000000000000000000000000000000000000081526004810183815289516024830152895194909216945063524f3889938993839260440191908501908083838215610b0e575b805182526020831115610b0e57601f199092019160209182019101610aee565b505050905090810190601f168015610b3a5780820380516001836020036101000a031916815260200191505b5092505050602060405180830381600087803b156100005760325a03f11561000057505060405151915050670de0b6b3a764000062030d403a0201811115610b855760009150610cef565b60015460408051600060209182015290517fadf59f9900000000000000000000000000000000000000000000000000000000815260048101888152606060248301908152885160648401528851600160a060020a039095169463adf59f999487948c948c948c949193909260448101926084909101918701908083838215610c28575b805182526020831115610c2857601f199092019160209182019101610c08565b505050905090810190601f168015610c545780820380516001836020036101000a031916815260200191505b5083810382528451815284516020918201918601908083838215610c93575b805182526020831115610c9357601f199092019160209182019101610c73565b505050905090810190601f168015610cbf5780820380516001836020036101000a031916815260200191505b50955050505050506020604051808303818588803b156100005761235a5a03f11561000057505060405151935050505b5b509392505050565b803b5b919050565b60006000610d21731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed610cf8565b1115610d925760008054600160a060020a031916731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed17905560408051808201909152600b81527f6574685f6d61696e6e65740000000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610db173c03a2615d5efaf5f49f60b7bb6583eaec212fdf1610cf8565b1115610e225760008054600160a060020a03191673c03a2615d5efaf5f49f60b7bb6583eaec212fdf117905560408051808201909152600c81527f6574685f726f707374656e3300000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610e4173b7a07bcf2ba2f2703b24c0691b5278999c59ac7e610cf8565b1115610eb25760008054600160a060020a03191673b7a07bcf2ba2f2703b24c0691b5278999c59ac7e17905560408051808201909152600981527f6574685f6b6f76616e00000000000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610ed173146500cfd35b22e4a392fe0adc06de1a1368ed48610cf8565b1115610f425760008054600160a060020a03191673146500cfd35b22e4a392fe0adc06de1a1368ed4817905560408051808201909152600b81527f6574685f72696e6b6562790000000000000000000000000000000000000000006020820152610d8a906112d0565b506001610cfb565b6000610f61736f485c8bf6fc43ea212e93bbf8ce046c7f1cb475610cf8565b1115610f95575060008054600160a060020a031916736f485c8bf6fc43ea212e93bbf8ce046c7f1cb4751790556001610cfb565b6000610fb47320e12a1f859b3feae5fb2a0a32c18f5a65555bbf610cf8565b1115610fe8575060008054600160a060020a0319167320e12a1f859b3feae5fb2a0a32c18f5a65555bbf1790556001610cfb565b60006110077351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa610cf8565b111561103b575060008054600160a060020a0319167351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa1790556001610cfb565b5060005b919050565b60408051602081810183526000808352835180830185528190528351808301855281905283518083018552819052835180830185528190528351808301855281905283518083018552818152845192830185528183528551875189518b518d51985197988e988e988e988e988e9890979296919586950190910190910101908059106110cd5750595b908082528060200260200182016040525b50935083925060009150600090505b885181101561114657888181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b6001016110ed565b5060005b87518110156111a357878181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b60010161114a565b5060005b865181101561120057868181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b6001016111a7565b5060005b855181101561125d57858181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b600101611204565b5060005b84518110156112ba57848181518110156100005790602001015160f860020a900460f860020a028383806001019450815181101561000057906020010190600160f860020a031916908160001a9053505b600101611261565b8299505b50505050505050505095945050505050565b8060029080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061131c57805160ff1916838001178555611349565b82800160010185558215611349579182015b8281111561134957825182559160200191906001019061132e565b5b506106319291505b808211156113665760008155600101611352565b5090565b50505b505600a165627a7a72305820dfdaa3b0d45ff0ceff2338169276492a5aed04855f41dbc4ab69d4973da986140029",
    "events": {
      "0x46cb989ef9cef13e930e3b7f286225a086e716a90d63e0b7da85d310a9db0c9a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "description",
            "type": "string"
          }
        ],
        "name": "newOraclizeQuery",
        "type": "event"
      },
      "0x158ef93e651b754acb66eb57a90cae1cb99d4bf585ce27c60e583652991b0ad1": {
        "anonymous": false,
        "inputs": [],
        "name": "initialized",
        "type": "event"
      },
      "0xc80db4d7a51a16db8f9d461371b8278937466bb0d34183db5036f7a0f874ead5": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "bidWin",
        "type": "event"
      },
      "0xb7d1f8cff4df65fbeb952c3bcd123546ce38217d1ad4a64ca4097c981d5dd012": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "bidder",
            "type": "address"
          }
        ],
        "name": "newBid",
        "type": "event"
      },
      "0xdca5b55a966a58c6afc26f63a5134da983b67a02830f0c0ccd19c1d422179082": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "houseAmount",
            "type": "uint256"
          }
        ],
        "name": "sellWin",
        "type": "event"
      }
    },
    "updated_at": 1496855358509
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "Offer";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.Offer = Contract;
  }
})();
